#!/usr/bin/env bash
# ============================================================
# ticketick — déploiement sur le serveur de production
# Lancé par .github/workflows/deploy-server.yml, qui dépose d'abord dans
# ~/ticketick-prod/incoming :
#   docker-compose.server.yml, Caddyfile, server-deploy.sh,
#   app.env      valeurs tirées de GitHub (paiement, SMTP, IA…)
#   release.env  images à tirer et adresses du site
#   registry-token  jeton ghcr.io valable le temps du workflow
# ============================================================
set -euo pipefail

APP_DIR="$HOME/ticketick-prod"
IN="$APP_DIR/incoming"
SECRETS="$APP_DIR/.secrets"
COMPOSE=(docker compose -f docker-compose.server.yml)
umask 077
cd "$APP_DIR"

echo "════════════════════════════════════════════"
echo "  ticketick PRODUCTION (serveur) — Deploy"
echo "  Hôte : $(hostname) · $(uname -m)"
echo "════════════════════════════════════════════"

# ── 1. Secrets figés au premier déploiement.
# Régénérer le mot de passe Postgres après l'initialisation du volume rendrait
# la base inaccessible ; changer AUTH_SECRET déconnecterait tout le monde et
# rendrait illisibles les secrets PayPal enregistrés dans l'admin. La reprise
# des données du GB10 y remet la valeur de là-bas.
if [ ! -f "$SECRETS" ]; then
  echo "🔑 Génération des secrets locaux (premier déploiement)..."
  {
    echo "POSTGRES_USER='ticketick'"
    echo "POSTGRES_DB='ticketick'"
    echo "POSTGRES_PASSWORD='$(openssl rand -hex 24)'"
    echo "AUTH_SECRET='$(openssl rand -base64 32)'"
  } > "$SECRETS"
fi

# ── 2. Fichiers de la version
mv -f "$IN/docker-compose.server.yml" "$APP_DIR/docker-compose.server.yml"
mv -f "$IN/Caddyfile" "$APP_DIR/Caddyfile"
chmod 644 "$APP_DIR/Caddyfile" "$APP_DIR/docker-compose.server.yml"
cat "$SECRETS" "$IN/app.env" "$IN/release.env" > "$APP_DIR/.env"
# shellcheck disable=SC1091
. "$APP_DIR/.env"

# ── 3. Images
echo "📥 Téléchargement des images..."
docker login ghcr.io -u "$REGISTRY_USER" --password-stdin < "$IN/registry-token" > /dev/null
rm -f "$IN/registry-token"
PULL_OK=1
"${COMPOSE[@]}" pull --quiet || PULL_OK=0
docker logout ghcr.io > /dev/null 2>&1 || true
if [ "$PULL_OK" -ne 1 ]; then
  echo "❌ Téléchargement des images impossible."
  exit 1
fi

# ── 4. Démarrage
echo "🚀 Démarrage..."
if ! "${COMPOSE[@]}" up -d --remove-orphans; then
  echo "❌ Démarrage en échec — sortie des migrations :"
  "${COMPOSE[@]}" logs --tail=80 migrate || true
  exit 1
fi

echo "⏳ Attente du démarrage..."
OK=0
for _ in $(seq 1 30); do
  if [ "$(docker inspect -f '{{.State.Health.Status}}' ticketick-prod-app 2>/dev/null)" = "healthy" ]; then
    OK=1
    break
  fi
  sleep 5
done
if [ "$OK" -ne 1 ]; then
  echo "❌ L'application ne répond pas — logs :"
  "${COMPOSE[@]}" logs --tail=80 migrate app || true
  exit 1
fi
echo "✅ Application opérationnelle"

# ── 5. Contrôles propres à la production
echo "🔎 État de la base :"
"${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtc \
  "SELECT 'spectacles=' || (SELECT count(*) FROM \"Event\")
       || ' publiés=' || (SELECT count(*) FROM \"Event\" WHERE status = 'PUBLISHED')
       || ' comptes=' || (SELECT count(*) FROM \"User\")
       || ' commandes=' || (SELECT count(*) FROM \"Order\");" \
  | sed -n 's/^ *\(.\)/   \1/p' || echo "   ⚠ Contrôle impossible"

check() {
  if [ -n "${!1:-}" ]; then echo "   ✅ $2"; else echo "   ⚠ $3"; fi
}
check PF_CHECKOUT_SECRET "PostFinance Checkout configuré" "PostFinance NON configuré — le paiement par carte sera refusé (503)."
check BANK_IBAN "IBAN configuré" "BANK_IBAN absent — le virement sera refusé (503)."
check SMTP_HOST "SMTP configuré" "SMTP absent — aucun courriel ne partira, ni billets ni réinitialisations."
check LITELLM_API_KEY "IA configurée pour l'import de plans" "Clé IA absente — l'import de plan marche, catégories à nommer à la main."

echo "🔎 Frontal HTTPS :"
if "${COMPOSE[@]}" exec -T caddy wget -q -O /dev/null http://app:3000/api/health; then
  echo "   ✅ Caddy joint l'application."
else
  echo "   ⚠ Caddy ne joint pas l'application."
fi
"${COMPOSE[@]}" logs --tail=200 caddy 2>&1 \
  | grep -E '"msg":"(certificate obtained successfully|obtaining certificate|could not get certificate from issuer)"' \
  | sed -E 's/.*"msg":"([^"]+)".*"identifier":"([^"]+)".*/   ↳ \2 : \1/' | sort -u | tail -6 || true

# ── 6. Nettoyage
docker image prune -af --filter "until=168h" > /dev/null 2>&1 || true
rm -rf "$IN"

echo "════════════════════════════════════════════"
echo "  ✅ Production déployée sur le serveur"
echo "════════════════════════════════════════════"
