#!/bin/sh
# ============================================================
# ticketick — sauvegarde de la base PostgreSQL et des fichiers téléversés
# Tourne dans le service `backup` (image postgres:16-alpine).
#   backup.sh        boucle : une sauvegarde par jour à BACKUP_HOUR
#   backup.sh now    une sauvegarde immédiate (avant chaque déploiement)
# ============================================================
# Chaque fichier est relu par pg_restore avant d'être gardé : une sauvegarde
# tronquée ne remplace jamais une bonne. BACKUP_KEEP_DAYS jours sont gardés
# sur le serveur. Si /config/rclone.conf et BACKUP_REMOTE sont fournis, les
# fichiers récents partent aussi hors du serveur (Swiss Backup, kDrive…) ;
# le chiffrement relève alors d'un remote rclone « crypt ».
set -eu
# Les sauvegardes contiennent toute la base, comptes compris.
umask 077

DIR=/backups
KEEP="${BACKUP_KEEP_DAYS:-14}"
REMOTE_KEEP="${BACKUP_REMOTE_KEEP_DAYS:-90}"
UPLOADS=/uploads
HOUR="${BACKUP_HOUR:-03}"
RCLONE_CONF=/config/rclone.conf

offsite_enabled() {
  [ -n "${BACKUP_REMOTE:-}" ] && [ -s "$RCLONE_CONF" ]
}

offsite() {
  offsite_enabled || return 0
  command -v rclone > /dev/null || apk add --no-cache -q rclone > /dev/null
  if rclone --config "$RCLONE_CONF" copy "$DIR" "$BACKUP_REMOTE" \
       --include 'ticketick-*.dump' --include 'ticketick-*.tar.gz' --max-age 72h --quiet; then
    echo "☁️  Copie hors serveur à jour ($BACKUP_REMOTE)"
    rclone --config "$RCLONE_CONF" delete "$BACKUP_REMOTE" \
      --include 'ticketick-*.dump' --include 'ticketick-*.tar.gz' \
      --min-age "${REMOTE_KEEP}d" --quiet \
      || echo "⚠ Nettoyage hors serveur en échec"
  else
    echo "⚠ Copie hors serveur en échec"
  fi
}

backup() {
  mkdir -p "$DIR"
  file="$DIR/ticketick-$(date +%Y%m%d-%H%M%S)${1:+-$1}.dump"
  if pg_dump -Fc -f "$file.part" && pg_restore --list "$file.part" > /dev/null; then
    mv "$file.part" "$file"
    echo "✅ Sauvegarde $(basename "$file") ($(du -h "$file" | cut -f1))"
  else
    rm -f "$file.part"
    echo "❌ Sauvegarde en échec"
    return 1
  fi
  if [ -d "$UPLOADS" ]; then
    up="${file%.dump}-fichiers.tar.gz"
    if tar -czf "$up.part" -C "$UPLOADS" . && tar -tzf "$up.part" > /dev/null; then
      mv "$up.part" "$up"
      echo "✅ Fichiers téléversés $(basename "$up") ($(du -h "$up" | cut -f1))"
    else
      rm -f "$up.part"
      echo "⚠ Archive des fichiers téléversés en échec"
    fi
  fi
  find "$DIR" \( -name 'ticketick-*.dump' -o -name 'ticketick-*.tar.gz' \) -mtime +"$KEEP" -delete
  offsite
}

if [ "${1:-}" = now ]; then
  backup "${2:-}"
  exit
fi

echo "▶ Sauvegarde quotidienne à ${HOUR} h, ${KEEP} jours gardés$(offsite_enabled && echo ", copie vers $BACKUP_REMOTE (${REMOTE_KEEP} jours)")"
last=""
while true; do
  today=$(date +%F)
  if [ "$(date +%H)" = "$HOUR" ] && [ "$last" != "$today" ]; then
    backup || true
    last="$today"
  fi
  sleep 300
done
