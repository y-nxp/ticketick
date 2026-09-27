#!/usr/bin/env bash
# ============================================================
# ticketick — préparation d'un VPS neuf (Ubuntu 22.04+/Debian 12+)
# À lancer une seule fois, en root :
#   sudo bash vps-setup.sh "ssh-ed25519 AAAA… ticketick-deploy"
# L'argument est la clé publique dont la clé privée va dans le secret GitHub
# PROD_SERVER_SSH_KEY. Le script peut être relancé sans dommage.
# ============================================================
set -euo pipefail

DEPLOY_USER=deploy
DEPLOY_KEY="${1:-}"

if [ "$(id -u)" -ne 0 ]; then echo "❌ À lancer en root (sudo)."; exit 1; fi
case "$DEPLOY_KEY" in
  ssh-ed25519\ * | ssh-rsa\ * | ecdsa-sha2-*) ;;
  *) echo "❌ Donner la clé publique de déploiement en argument."; exit 1 ;;
esac
# Couper les mots de passe sans clé en place fermerait la porte à tout le monde.
if ! find /root/.ssh /home -maxdepth 3 -name authorized_keys -size +0 2>/dev/null | grep -q .; then
  echo "❌ Aucune clé SSH d'administration trouvée : en ajouter une avant de lancer ce script."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
echo "▶ Système à jour..."
apt-get update -qq
apt-get -y -qq -o Dpkg::Options::=--force-confold full-upgrade
apt-get -y -qq install ca-certificates curl openssl ufw fail2ban unattended-upgrades > /dev/null
timedatectl set-timezone Europe/Zurich

echo "▶ Docker..."
if ! command -v docker > /dev/null; then
  curl -fsSL https://get.docker.com | sh > /dev/null
fi
# Journaux bornés : sans rotation, les logs des conteneurs finissent par
# remplir le disque.
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "20m", "max-file": "5" }
}
EOF
  systemctl restart docker
fi
systemctl enable --now docker > /dev/null 2>&1

echo "▶ Utilisateur de déploiement « $DEPLOY_USER »..."
id "$DEPLOY_USER" > /dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
usermod -aG docker "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AK="/home/$DEPLOY_USER/.ssh/authorized_keys"
touch "$AK"
grep -qxF "$DEPLOY_KEY" "$AK" || echo "$DEPLOY_KEY" >> "$AK"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AK"
chmod 600 "$AK"

echo "▶ SSH : clés uniquement..."
# Préfixe 00 : sshd garde la première valeur lue, et cloud-init dépose
# souvent un 50-cloud-init.conf qui rouvre les mots de passe.
cat > /etc/ssh/sshd_config.d/00-ticketick.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 4
EOF
sshd -t
systemctl reload ssh 2> /dev/null || systemctl reload sshd

echo "▶ Pare-feu..."
# Docker publie les ports 80/443 hors de ufw : le filtre « Cloudflare
# seulement » est fait par Caddy (deploy/Caddyfile). ufw ferme tout le reste.
ufw default deny incoming > /dev/null
ufw default allow outgoing > /dev/null
ufw allow OpenSSH > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw allow 443/udp > /dev/null
ufw --force enable > /dev/null

echo "▶ fail2ban (SSH)..."
cat > /etc/fail2ban/jail.d/ticketick.conf <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
bantime = 1h
EOF
systemctl enable --now fail2ban > /dev/null 2>&1
systemctl restart fail2ban

echo "▶ Mises à jour de sécurité automatiques..."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
cat > /etc/apt/apt.conf.d/52ticketick-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF

# Filet contre un pic de mémoire (migrations, affluence) sur une petite machine.
if ! swapon --show | grep -q . && [ "$(awk '/MemTotal/{print int($2/1024/1024)}' /proc/meminfo)" -lt 8 ]; then
  echo "▶ Swap de 2 Go..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile > /dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "════════════════════════════════════════════"
echo "  ✅ VPS prêt"
# shellcheck disable=SC1091
echo "  $(. /etc/os-release && echo "$PRETTY_NAME") · $(uname -m) · Docker $(docker version --format '{{.Server.Version}}')"
echo "  Secrets GitHub : PROD_SERVER_HOST = IP de ce serveur,"
echo "  PROD_SERVER_USER = $DEPLOY_USER, PROD_SERVER_SSH_KEY = clé privée."
echo "════════════════════════════════════════════"
