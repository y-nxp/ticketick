#!/bin/sh
set -e

# Volume monté : le dossier appartient souvent à root. On le rend
# écrivable par nextjs avant de lâcher les privilèges.
UPLOAD_DIR="${UPLOAD_DIR:-/app/data/uploads}"
mkdir -p "$UPLOAD_DIR"
chown -R nextjs:nodejs "$UPLOAD_DIR"

echo "▶ Démarrage de ticketick sur :${PORT:-3000}"
exec su-exec nextjs node server.js
