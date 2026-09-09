#!/bin/sh
set -e

# Applique les migrations Prisma avant de démarrer le serveur.
# Un échec est bloquant : démarrer sur une base sans tables donnerait une
# application qui répond mais ne sert aucun contenu.
PRISMA_CLI="./node_modules/prisma/build/index.js"
if [ ! -f "$PRISMA_CLI" ]; then
  echo "✖ CLI Prisma introuvable ($PRISMA_CLI)."
  exit 1
fi

echo "▶ Prisma migrate deploy…"
if ! node "$PRISMA_CLI" migrate deploy; then
  echo "✖ Migrations non appliquées. Arrêt."
  exit 1
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
