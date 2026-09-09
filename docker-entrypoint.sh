#!/bin/sh
set -e

# Applique les migrations Prisma avant de démarrer le serveur.
# (nécessite DATABASE_URL et le CLI Prisma présents dans l'image)
if [ -f "./node_modules/prisma/build/index.js" ]; then
  echo "▶ Prisma migrate deploy…"
  node ./node_modules/prisma/build/index.js migrate deploy || {
    echo "⚠ Aucune migration appliquée (schéma vide ?). On continue."
  }
fi

echo "▶ Démarrage de ticketick sur :${PORT:-3000}"
exec node server.js
