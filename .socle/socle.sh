#!/bin/bash
# Socle NXP — fonctions de mise en production sans coupure, sourcées par le server-deploy.sh de
# chaque projet (déposé dans le paquet de la version par l'action y-nxp/socle/actions/server-files).
#
# Principe :
#   1. seules les images de la version sont téléchargées : la base, Caddy et les outils ne sont
#      jamais recréés en plein déploiement par une nouvelle image (mise à jour d'Alpine) ;
#   2. les services d'infrastructure sont créés s'ils manquent, recréés seulement si leur
#      configuration change ;
#   3. les migrations passent pendant que l'ancienne version sert encore ;
#   4. seul le conteneur de l'application est remplacé ; le proxy (Caddy, lb_try_duration) fait
#      patienter les visiteurs pendant son démarrage ;
#   5. si la nouvelle version ne devient pas saine, l'ancienne image est remise en service.
#
# Utilisation (dans le dossier du projet sur le serveur, .env écrit) :
#   SOCLE_COMPOSE=(docker compose -f docker-compose.server.yml)
#   . ./socle.sh
#   socle_pull app migrate
#   socle_infra db backup caddy
#   socle_wait_healthy ticketick-prod-db 60
#   socle_migrate migrate
#   socle_swap app ticketick-prod-app IMAGE_APP
#   socle_caddy_reload compose:caddy          # ou container:apps-caddy (Caddy commun)
#   socle_check_version https://ticketick.ch/api/health "$APP_VERSION"
#
# Les migrations doivent rester compatibles avec la version précédente (ajouter avant de
# retirer) : en cas de retour arrière, l'ancienne image retrouve une base déjà migrée.

SOCLE_VERSION="1.3.0"

_socle_compose() {
  if [ "${#SOCLE_COMPOSE[@]}" -eq 0 ]; then
    echo "❌ SOCLE_COMPOSE non défini (ex. SOCLE_COMPOSE=(docker compose -f docker-compose.server.yml))" >&2
    return 1
  fi
  "${SOCLE_COMPOSE[@]}" "$@"
}

# Télécharge seulement les images des services donnés (celles de la version).
socle_pull() {
  echo "📥 Images de la version : $*"
  _socle_compose pull --quiet "$@"
}

# Services d'infrastructure : créés s'ils manquent, recréés seulement si leur configuration a changé.
socle_infra() {
  [ "$#" -eq 0 ] && return 0
  _socle_compose up -d --no-deps "$@"
}

# Attend qu'un conteneur soit sain (healthcheck), ou simplement en marche s'il n'en a pas.
socle_wait_healthy() {
  local container=$1 timeout=${2:-180} waited=0 state
  while [ "$waited" -lt "$timeout" ]; do
    state=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo absent)
    case "$state" in
      healthy | running) return 0 ;;
      exited | dead) return 1 ;;
    esac
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

# Migrations dans un conteneur jetable, pendant que l'ancienne version sert encore.
socle_migrate() {
  local service=$1
  echo "🗃️  Migrations ($service) : l'ancienne version reste en ligne pendant ce temps."
  if ! _socle_compose run --rm --no-deps -T "$service"; then
    echo "❌ Migrations en échec : l'ancienne version reste en ligne, rien n'a été remplacé."
    return 1
  fi
}

# Remplace le conteneur d'un service applicatif. Si la nouvelle version ne devient pas saine
# dans le délai, l'image précédente est remise en service et la fonction échoue.
#   socle_swap <service> <conteneur> <variable de l'image dans .env> [délai en s]
# La version (APP_VERSION, ou SOCLE_VERSION_VAR) de l'ancien conteneur revient avec son image :
# sinon, après un retour arrière, l'ancienne image annoncerait la nouvelle version.
socle_swap() {
  local service=$1 container=$2 var=$3 timeout=${4:-180}
  local version_var=${SOCLE_VERSION_VAR:-APP_VERSION}
  local previous wanted previous_version
  previous=$(docker inspect -f '{{.Config.Image}}' "$container" 2>/dev/null || true)
  previous_version=$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$container" 2>/dev/null \
    | sed -n "s/^${version_var}=//p" | head -1)
  wanted=${!var:-}
  echo "🔁 Remplacement de $service : ${previous:-aucun} → ${wanted:-?}"
  if _socle_compose up -d --no-deps "$service" && socle_wait_healthy "$container" "$timeout"; then
    echo "✅ $service : nouvelle version saine."
    return 0
  fi
  echo "❌ $service : la nouvelle version ne devient pas saine. Dernières lignes :"
  docker logs --tail=60 "$container" 2>&1 || true
  if [ -z "$previous" ] || [ "$previous" = "$wanted" ]; then
    echo "⚠ Pas de version précédente à remettre en service."
    return 1
  fi
  echo "↩️  Retour à la version précédente : $previous"
  _socle_set_env "$var" "$previous"
  export "$var=$previous"
  if grep -q "^${version_var}=" "${SOCLE_ENV_FILE:-.env}" 2>/dev/null; then
    _socle_set_env "$version_var" "$previous_version"
    export "$version_var=$previous_version"
  fi
  if _socle_compose up -d --no-deps "$service" && socle_wait_healthy "$container" "$timeout"; then
    echo "↩️  Version précédente de nouveau en ligne. Le déploiement est marqué en échec."
  else
    echo "🚨 La version précédente ne redémarre pas non plus : intervention nécessaire."
  fi
  return 1
}

# Remplace (ou ajoute) VAR='valeur' dans le .env du projet, lu par docker compose.
_socle_set_env() {
  local var=$1 value=$2 file=${SOCLE_ENV_FILE:-.env}
  [ -f "$file" ] || return 0
  if grep -q "^${var}=" "$file"; then
    local tmp
    tmp=$(mktemp)
    awk -v k="$var" -v v="$value" 'index($0, k "=") == 1 { print k "='\''" v "'\''"; next } { print }' "$file" > "$tmp"
    cat "$tmp" > "$file"
    rm -f "$tmp"
  else
    printf "%s='%s'\n" "$var" "$value" >> "$file"
  fi
}

# Recharge la configuration de Caddy sans couper les connexions.
#   compose:<service>     Caddy de la pile du projet
#   container:<conteneur> Caddy commun (ex. apps-caddy du VPS apps-nxp)
socle_caddy_reload() {
  local target=$1 cmd=(caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile)
  case "$target" in
    compose:*) _socle_compose exec -T "${target#compose:}" "${cmd[@]}" > /dev/null 2>&1 ;;
    container:*) docker exec "${target#container:}" "${cmd[@]}" > /dev/null 2>&1 ;;
    *) echo "❌ socle_caddy_reload : compose:<service> ou container:<conteneur>" >&2; return 1 ;;
  esac || { echo "⚠ Rechargement de Caddy impossible : l'ancienne configuration reste active."; return 1; }
}

# Vérifie que l'adresse publique sert la version attendue (contrat /api/health du socle :
# {"ok": true, "version": "<commit>"}). Sans version attendue, vérifie seulement la réponse.
socle_check_version() {
  local url=$1 expected=${2:-} tries=${3:-15} body version i
  for i in $(seq 1 "$tries"); do
    body=$(curl -fsS --max-time 10 "$url" 2>/dev/null || true)
    if [ -n "$body" ]; then
      version=$(printf '%s' "$body" | sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p')
      if [ -z "$expected" ] || [ "$version" = "$expected" ]; then
        echo "✅ $url répond${version:+ (version ${version:0:7})}."
        return 0
      fi
    fi
    sleep 4
  done
  if [ -n "${version:-}" ]; then
    echo "⚠ $url sert la version ${version:0:7} au lieu de ${expected:0:7}."
  else
    echo "⚠ $url : pas de réponse correcte."
  fi
  return 1
}
