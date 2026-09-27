#!/usr/bin/env bash
# ============================================================
# ticketick — reprise des données de production du GB10
# Lancé par .github/workflows/migrate-gb10-to-server.yml, qui dépose dans
# ~/ticketick-prod/migration :
#   db.dump       pg_dump -Fc de la base du GB10
#   uploads.tar   contenu du volume des images téléversées
#   auth-secret   AUTH_SECRET du GB10
# La base du serveur est entièrement remplacée.
# ============================================================
set -euo pipefail

APP_DIR="$HOME/ticketick-prod"
MIG="$APP_DIR/migration"
SECRETS="$APP_DIR/.secrets"
COMPOSE=(docker compose -f docker-compose.server.yml)
umask 077
cd "$APP_DIR"

if [ ! -f "$APP_DIR/.env" ] || [ ! -f "$SECRETS" ]; then
  echo "❌ Serveur jamais déployé : lancer d'abord « Deploy Production → serveur »."
  exit 1
fi
for f in db.dump uploads.tar auth-secret; do
  if [ ! -s "$MIG/$f" ]; then
    echo "❌ $f manquant."
    exit 1
  fi
done

# ── 1. Même AUTH_SECRET qu'au GB10 : sessions ouvertes et secrets PayPal
# chiffrés en base restent valables.
AUTH="$(cat "$MIG/auth-secret")"
case "$AUTH" in
  *"'"* | "") echo "❌ AUTH_SECRET du GB10 inutilisable."; exit 1 ;;
esac
for f in "$SECRETS" "$APP_DIR/.env"; do
  grep -v '^AUTH_SECRET=' "$f" > "$f.tmp"
  echo "AUTH_SECRET='$AUTH'" >> "$f.tmp"
  mv -f "$f.tmp" "$f"
done
# shellcheck disable=SC1091
. "$APP_DIR/.env"

# ── 2. Base
echo "⏸  Arrêt de l'application..."
"${COMPOSE[@]}" stop app > /dev/null
"${COMPOSE[@]}" up -d db > /dev/null
for _ in $(seq 1 30); do
  "${COMPOSE[@]}" exec -T db pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1 && break
  sleep 2
done

echo "🗄️  Restauration de la base..."
"${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SET client_min_messages = warning;' -c 'DROP SCHEMA public CASCADE;' -c 'CREATE SCHEMA public;'
"${COMPOSE[@]}" exec -T db pg_restore --exit-on-error --no-owner --no-privileges \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$MIG/db.dump"

# ── 3. Images téléversées
echo "🖼️  Restauration des fichiers téléversés..."
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh app \
  -c 'find /app/data/uploads -mindepth 1 -delete && tar -xf - -C /app/data/uploads' < "$MIG/uploads.tar"

# ── 4. Redémarrage : migrations (sans effet si la base est à jour) puis app
echo "🚀 Redémarrage..."
"${COMPOSE[@]}" up -d --force-recreate migrate app
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

echo "🔎 Base reprise :"
"${COMPOSE[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -qtc \
  "SELECT 'spectacles=' || (SELECT count(*) FROM \"Event\")
       || ' publiés=' || (SELECT count(*) FROM \"Event\" WHERE status = 'PUBLISHED')
       || ' comptes=' || (SELECT count(*) FROM \"User\")
       || ' commandes=' || (SELECT count(*) FROM \"Order\")
       || ' billets=' || (SELECT count(*) FROM \"Ticket\");" | sed -n 's/^ *\(.\)/   \1/p'

rm -rf "$MIG"
echo "✅ Données du GB10 reprises."
