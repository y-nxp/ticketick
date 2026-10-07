#!/usr/bin/env bash
# ============================================================
# ticketick — déploiement sur le serveur de production
# Lancé par .github/workflows/deploy-server.yml, qui dépose d'abord dans
# ~/ticketick-prod/incoming :
#   docker-compose.server.yml, Caddyfile, server-deploy.sh,
#   app.env      valeurs tirées de GitHub (paiement, SMTP, IA…)
#   release.env  images à tirer et adresses du site
#   registry-token  jeton ghcr.io valable le temps du workflow
#   backup.sh, rclone.conf (facultatif) : sauvegardes de la base
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
echo "  Architecture : $(uname -m)"
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
for f in docker-compose.server.yml Caddyfile backup.sh; do
  mv -f "$IN/$f" "$APP_DIR/$f"
  chmod 644 "$APP_DIR/$f"
done
# Monté tel quel dans le service de sauvegarde : absent, Docker créerait un
# dossier à sa place. Vide, la copie hors serveur est simplement désactivée.
if [ -s "$IN/rclone.conf" ]; then
  mv -f "$IN/rclone.conf" "$APP_DIR/rclone.conf"
else
  : > "$APP_DIR/rclone.conf"
fi
mkdir -p "$APP_DIR/backups"
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

# ── 4. Sauvegarde avant de toucher à la base (migrations)
if [ "$(docker inspect -f '{{.State.Running}}' ticketick-prod-db 2>/dev/null)" = true ]; then
  echo "💾 Sauvegarde avant déploiement..."
  "${COMPOSE[@]}" run --rm --no-deps -T backup now avant-deploiement
fi

# ── 5. Démarrage
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

# ── 6. Contrôles propres à la production
echo "🔎 État de la base :"
"${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtc \
  "SELECT 'spectacles=' || (SELECT count(*) FROM \"Event\")
       || ' publiés=' || (SELECT count(*) FROM \"Event\" WHERE status = 'PUBLISHED')
       || ' comptes=' || (SELECT count(*) FROM \"User\")
       || ' commandes=' || (SELECT count(*) FROM \"Order\");" \
  | sed -n 's/^ *\(.\)/   \1/p' || echo "   ⚠ Contrôle impossible"

# Chaque organisateur encaisse sur ses comptes (admin › Encaissement).
echo "💳 Encaissement des organisateurs qui vendent :"
"${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtc \
  "SELECT o.name || ' : ' || coalesce(nullif(concat_ws(', ',
            CASE WHEN pf.enabled THEN 'carte (PostFinance)' END,
            CASE WHEN st.enabled THEN 'carte (Stripe)' END,
            CASE WHEN pp.enabled THEN 'PayPal' END,
            CASE WHEN o.\"bankIban\" IS NOT NULL THEN 'virement' END), ''),
          '⚠ aucun — paiement pas encore activé')
     FROM \"Organizer\" o
     LEFT JOIN \"OrganizerPostfinanceAccount\" pf ON pf.\"organizerId\" = o.id
     LEFT JOIN \"OrganizerStripeAccount\" st ON st.\"organizerId\" = o.id
     LEFT JOIN \"OrganizerPaypalAccount\" pp ON pp.\"organizerId\" = o.id
    WHERE EXISTS (SELECT 1 FROM \"Event\" e
                   WHERE e.\"organizerId\" = o.id AND e.status = 'PUBLISHED')
    ORDER BY o.name;" \
  | sed -n 's/^ *\(.\)/   \1/p' || echo "   ⚠ Contrôle impossible"

check() {
  if [ -n "${!1:-}" ]; then echo "   ✅ $2"; else echo "   ⚠ $3"; fi
}
check SMTP_HOST "SMTP configuré" "SMTP absent — aucun courriel ne partira, ni billets ni réinitialisations."
check LITELLM_API_KEY "IA configurée pour l'import de plans" "Clé IA absente — l'import de plan marche, catégories à nommer à la main."
if [ -n "${BACKUP_REMOTE:-}" ] && [ -s "$APP_DIR/rclone.conf" ]; then
  echo "   ✅ Sauvegardes quotidiennes, copiées vers $BACKUP_REMOTE"
else
  echo "   ⚠ Sauvegardes quotidiennes sur le serveur seulement (BACKUP_REMOTE / BACKUP_RCLONE_CONF absents)"
fi
echo "   ↳ $(find "$APP_DIR/backups" -name 'ticketick-*.dump' | wc -l | tr -d ' ') sauvegarde(s) dans ~/ticketick-prod/backups"

echo "🔎 Frontal HTTPS :"
if "${COMPOSE[@]}" exec -T caddy wget -q -O /dev/null http://app:3000/api/health; then
  echo "   ✅ Caddy joint l'application."
else
  echo "   ⚠ Caddy ne joint pas l'application."
fi
"${COMPOSE[@]}" logs --tail=200 caddy 2>&1 \
  | grep -E '"msg":"(certificate obtained successfully|obtaining certificate|could not get certificate from issuer)"' \
  | sed -E 's/.*"msg":"([^"]+)".*"identifier":"([^"]+)".*/   ↳ \2 : \1/' | sort -u | tail -6 || true

# ── 7. Nettoyage
docker image prune -af --filter "until=168h" > /dev/null 2>&1 || true
rm -rf "$IN"

echo "════════════════════════════════════════════"
echo "  ✅ Production déployée sur le serveur"
echo "════════════════════════════════════════════"
