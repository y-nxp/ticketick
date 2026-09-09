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

# Jeu de démonstration pour les environnements de recette. Le seed est
# convergent (upserts), donc le rejouer à chaque déploiement est sans risque.
# Jamais activé en production : la donnée y est réelle.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "▶ Seed du catalogue de démonstration…"
  node prisma/seed.mjs || {
    echo "⚠ Seed échoué. On démarre quand même."
  }
fi

echo "▶ Démarrage de ticketick sur :${PORT:-3000}"
exec node server.js
