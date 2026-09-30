# ticketick 🎟️🇨🇭

La billetterie suisse moderne — **ticketick.ch** (international : ticketick.net).

Réservation de billets pour concerts, théâtre, festivals, humour et plus.
Multilingue **FR / EN / DE / IT**, paiement **PostFinance Checkout** ou **virement IBAN**,
billets envoyés par e-mail. Espaces **client**, **organisateur** et **amis du festival**.

## Stack technique

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS v4** — design system maison (rouge signature, coins arrondis)
- **next-intl** — internationalisation FR/EN/DE/IT
- **Prisma 6** + **PostgreSQL**
- **lucide-react** — icônes
- Paiement : **Stripe Checkout** (carte) + **IBAN**
- E-mail : **SMTP** (nodemailer, à brancher)

## Démarrer en local

```bash
npm install
cp .env.example .env      # puis renseignez DATABASE_URL
npm run dev               # http://localhost:3000
```

> L'interface fonctionne immédiatement avec un **jeu de données de démo**
> (`src/lib/mock-data.ts`), sans base de données. Branchez PostgreSQL quand vous
> êtes prêt (voir ci-dessous).

## Base de données

```bash
# Générer le client Prisma
npm run db:generate

# Créer/mettre à jour le schéma en base
npm run db:push          # ou: npm run db:migrate

# Peupler avec les données de démo
npm run db:seed

# Explorer la base
npm run db:studio
```

Le schéma (`prisma/schema.prisma`) couvre : `User`, `Organizer`, `Category`,
`Venue`, `Event` (multi‑catégories, map optionnelle), `SeatMap`, `TicketType`,
`Order`, `OrderItem`, `Ticket`, `Payment`.

## Variables d'environnement

Voir [`.env.example`](.env.example). Principales :

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL |
| `AUTH_SECRET` | Secret d'authentification (Auth.js) |
| `PF_CHECKOUT_SPACE_ID` / `PF_CHECKOUT_USER` / `PF_CHECKOUT_SECRET` | Espace PostFinance d'Illyria, repris une fois dans l'admin (voir Encaissement) |
| `STRIPE_*` | Facturation des organisateurs (plus tard), pas les billets |
| `SMTP_*` / `MAIL_FROM` | Envoi des e-mails (vide = journalisation console) |

## Structure

```
src/
├─ app/[locale]/            # Pages localisées (public, client, organisateur, amis)
│  ├─ page.tsx              # Accueil : liste des spectacles + filtres
│  ├─ events/[slug]/        # Détail événement + sélection de billets
│  ├─ cart/ · checkout/     # Panier + tunnel de paiement
│  ├─ account/              # Espace client
│  ├─ organizer/            # Espace organisateur + dashboard
│  └─ friends/              # PWA amis du festival
├─ app/api/checkout/        # API de création de commande
├─ components/              # UI, layout (header/footer), events, cart
├─ i18n/                    # Configuration next-intl
├─ lib/                     # types, données démo, prisma, paiement, e-mail
└─ proxy.ts                 # Middleware next-intl (routing des langues)
messages/                   # Traductions fr / en / de / it
prisma/                     # schema.prisma + seed.ts
```

## Fonctionnalités livrées

- ✅ Accueil : tous les spectacles, filtres (recherche, catégorie, ville, date, tri)
- ✅ Header : compte, panier, sélecteur de langue, bouton « Je suis organisateur »
- ✅ Détail événement : infos, catégories multiples, plan (OpenStreetMap) optionnel
- ✅ Panier + tunnel de paiement (carte PostFinance / IBAN) — mode mock
- ✅ Confirmation + billets par e-mail (stub prêt pour SMTP + PDF)
- ✅ Espace client (connexion, mes billets/commandes)
- ✅ Espace organisateur (landing + tableau de bord des ventes)
- ✅ Amis du festival (landing PWA)

## À brancher pour la production

1. **Encaissement par organisateur** (admin › Encaissement, `/admin/payments`) :
   chaque organisateur encaisse sur ses propres comptes — espace PostFinance
   Checkout (carte), PayPal, IBAN (virement). Il n'y a aucun compte commun :
   un organisateur sans compte reste « En attente » ; ses billets s'achètent
   jusqu'à l'étape du paiement, qui affiche « Paiement pas encore activé ».
   Un panier ne peut mêler plusieurs organisateurs.
   - Au déploiement, `prisma/ensure-illyria-account.ts` reprend `PF_CHECKOUT_*`
     comme espace d'Illyria s'il n'en a pas encore ; ensuite, seul l'admin fait foi.
   - Le paiement carte crée une transaction dans l'espace de l'organisateur
     (`src/lib/payment/postfinance.ts`) et redirige vers la page hébergée. Le
     webhook (`/api/webhooks/postfinance`) et le retour acheteur soldent la
     commande puis envoient les billets. **Dans chaque espace PostFinance** :
     Webhook URL + listener `pf_paid`, entité Transaction. Les spectacles se
     distinguent par la référence `{slug}:{commande}`.
   - Les secrets sont chiffrés en base (`PAYMENT_SECRETS_KEY`, à défaut
     `AUTH_SECRET`).
   - `ALLOW_MOCK_PAYMENTS=true` (local, betadev) remplace carte et virement
     manquants par un paiement simulé : le message « pas encore activé »
     n'apparaît donc qu'en production.
   - **Page de l'organisateur** `/go/{organisateur}` : ses spectacles à venir,
     à ses couleurs, avec un bouton de partage. Le lien figure en tête de
     admin › Spectacles. Dans cette liste, l'interrupteur « Publier sur
     ticketick » affiche ou non le spectacle sur l'accueil de ticketick.ch
     (visibilité publique ou non listée) ; il reste vendu sur la page de
     l'organisateur dans les deux cas.
2. **E-mail** : configurer SMTP dans `src/lib/email.ts` + génération PDF des billets (QR).
3. **Auth.js** : brancher l'authentification réelle sur le modèle `User`.
4. **Persistance des commandes** : écrire les `Order`/`Ticket` en base dans `api/checkout`.

## Déploiement

| Branche   | Cible                                    | Mécanisme                              |
| --------- | ---------------------------------------- | -------------------------------------- |
| `develop` | gb10 → `appbetadev.ticketick.ch`         | `.github/workflows/deploy-betadev.yml` |
| `main`    | gb10 → `ticketick.ch` (actuel)           | `.github/workflows/deploy-prod.yml`    |
| `main`    | Jelastic ou VPS → `ticketick.ch` (cible) | `.github/workflows/deploy-server.yml`  |

La variable GitHub `PROD_TARGET` choisit la production servie par `main` :
absente, c'est le GB10 ; `server`, c'est le serveur Jelastic ou VPS.

### BetaDev — gb10 → `appbetadev.ticketick.ch`

Chaque push sur `develop` déclenche le workflow, qui se connecte en SSH à gb10
(secrets `GB10_HOST`, `GB10_USER`, `GB10_SSH_PRIVATE_KEY`, `GB10_PORT`), met à jour
le dépôt dans `~/ticketick-v2-betadev`, puis lance `docker-compose.betadev.yml`.

- L'application écoute sur **127.0.0.1:3005** ; Nginx Proxy Manager doit router
  `appbetadev.ticketick.ch` vers ce port.
- PostgreSQL n'est **pas** publié sur l'hôte : seul le conteneur applicatif y accède,
  ce qui évite tout conflit de port avec les autres stacks de gb10.
- Le mot de passe Postgres et `AUTH_SECRET` sont générés au premier déploiement puis
  conservés dans `~/.ticketick-v2-betadev.secrets`. Les régénérer après l'initialisation
  du volume rendrait la base inaccessible.
- Le déploiement échoue si `/api/health` ne répond pas dans les deux minutes.

### Production — Jelastic ou VPS → `ticketick.ch`

N'importe quel serveur Linux avec Docker et `docker compose` v2, joignable en
SSH : nœud **Docker Engine** Jelastic avec IP publique, ou VPS. Il faut 2 Go
de mémoire, quelques Go de disque et les ports 80 et 443 ouverts. Rien n'est
construit sur le serveur : GitHub construit les images (`-app` et `-tools`)
pour l'architecture du serveur, les publie sur ghcr.io, et le serveur les
tire. La pile (`docker-compose.server.yml`) comprend PostgreSQL,
l'application, les sauvegardes et Caddy, qui obtient seul le certificat HTTPS.

**Préparer un VPS neuf** (Ubuntu ou Debian, une fois, avec le compte
d'administration créé par l'hébergeur — `ubuntu` chez Infomaniak — et sa clé
SSH) :

```bash
ssh-keygen -t ed25519 -f ticketick-deploy -N ""   # sur son poste
scp deploy/vps-setup.sh ubuntu@IP:
ssh ubuntu@IP 'sudo bash vps-setup.sh "$(cat)"' < ticketick-deploy.pub
```

Le script met le système à jour, installe Docker, crée l'utilisateur
`deploy` (clé de déploiement seulement), ferme la connexion par mot de passe,
active le pare-feu (SSH, 80, 443), fail2ban et les mises à jour de sécurité
automatiques (redémarrage à 04:30 si nécessaire).

**Cloudflare obligatoire** : Caddy répond 403 à toute connexion qui ne vient
pas de Cloudflare (plages de https://www.cloudflare.com/ips, variable
`ALLOWED_IPS`). L'application se fie à l'en-tête `cf-connecting-ip` pour
limiter les tentatives de connexion : sans ce filtre, il serait falsifiable.
Le nuage orange doit donc rester actif sur `ticketick.ch` et `www`.

**Valeurs GitHub**

- Secrets `PROD_SERVER_HOST`, `PROD_SERVER_USER` (`deploy`),
  `PROD_SERVER_SSH_KEY` (contenu de `ticketick-deploy`) et `PROD_SERVER_PORT`
  (22 par défaut). L'utilisateur doit pouvoir lancer `docker` (root ou groupe
  `docker`). Les secrets `JELASTIC_*` du dépôt ne sont pas utilisés : ils
  peuvent désigner un autre serveur.
- Courriel : `SMTP_*`. Encaissement : `PF_CHECKOUT_*` (espace d'Illyria,
  repris au premier déploiement) ; le reste se saisit dans admin › Encaissement.
- IA de l'import de plans : hors du GB10, l'application joint aimanager par
  son adresse publique. Secret `LITELLM_API_KEY` (clé « jelastic » du projet
  ticketick, révocable seule), variables `LITELLM_API_URL`
  (`https://api-ai.nextalp.com/v1/chat/completions`) et `PLAN_AI_MODEL`.
- Facultatif : variable `PROD_SITE_ADDRESS` (défaut `ticketick.ch`), par
  exemple `ticketick.ch, nouveau.ticketick.ch` pour essayer le serveur sur un
  nom de test avant la bascule.
- Facultatif, copie des sauvegardes hors du serveur : secret
  `BACKUP_RCLONE_CONF` (fichier de configuration rclone) et variable
  `BACKUP_REMOTE` (par exemple `swissbackup-crypt:ticketick`). Utiliser un
  remote rclone `crypt` : les sauvegardes contiennent toute la base.

**Sauvegardes**

Le service `backup` sauvegarde la base chaque nuit à 03:00 dans
`~/ticketick-prod/backups` (14 jours gardés), et avant chaque déploiement.
Chaque fichier est relu avant d'être gardé. Sauvegarde immédiate et
restauration :

```bash
cd ~/ticketick-prod
docker compose -f docker-compose.server.yml run --rm --no-deps backup now manuelle
docker compose -f docker-compose.server.yml stop app
docker exec -i ticketick-prod-db pg_restore -U ticketick -d ticketick \
  --clean --if-exists --no-owner < backups/ticketick-AAAAMMJJ-HHMMSS.dump
docker compose -f docker-compose.server.yml start app
```

Le GB10 a le même service : sauvegardes dans `~/ticketick-v2-prod-backups`
(conteneur `ticketick-v2-prod-db`).

**Workflows**

- *Deploy Production → serveur*, mode `verifier` : contrôle les valeurs
  GitHub, la clé IA, le serveur (Docker, mémoire, disque, ports) et
  l'export de la base du GB10. Ne modifie rien.
- Même workflow, mode `deployer` : construit, publie et déploie. Le mot de
  passe Postgres et `AUTH_SECRET` sont générés au premier déploiement dans
  `~/ticketick-prod/.secrets`, puis conservés.
- *Reprise des données — GB10 → serveur* : arrête l'application du GB10,
  copie la base, les fichiers téléversés et `AUTH_SECRET` (les sessions et
  les secrets PayPal chiffrés en base restent valables), puis remplace la
  base du serveur. En cas d'échec, l'application du GB10 est redémarrée.

**Bascule**

1. `verifier`, puis `deployer` : le serveur tourne à vide, le GB10 sert
   toujours le site.
2. *Reprise des données* (taper `MIGRER`). Le site est indisponible jusqu'à
   l'étape suivante.
3. Cloudflare : faire pointer `ticketick.ch` et `www` sur l'IP du serveur,
   en gardant le proxy. Caddy obtient son certificat dans la minute.
4. Variable `PROD_TARGET` = `server` : les push sur `main` déploient
   désormais le serveur, et plus le GB10.

Retour arrière : repointer Cloudflare sur le GB10, y lancer
`docker start ticketick-v2-prod-app`, puis retirer `PROD_TARGET`.

---

Conçu en Suisse 🇨🇭
