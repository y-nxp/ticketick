#!/bin/sh
set -e

# Les migrations et le seed sont pris en charge par le service `migrate`,
# qui dispose de l'arbre de dépendances complet du CLI Prisma. Le conteneur
# applicatif ne démarre qu'une fois ce service terminé avec succès.

echo "▶ Démarrage de ticketick sur :${PORT:-3000}"
exec node server.js
