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
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe Checkout (vide = mode mock) |
| `SMTP_*` / `MAIL_FROM` | Envoi des e-mails (vide = journalisation console) |
| `BANK_IBAN` / `BANK_BENEFICIARY` | Coordonnées pour le paiement par virement |

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

1. **Stripe** : renseigner `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`. Le paiement
   carte crée une Checkout Session (`src/lib/payment/stripe.ts`) et le webhook
   (`/api/webhooks/stripe`) confirme le paiement puis déclenche l'envoi des billets.
   Configurez l'endpoint webhook dans le dashboard Stripe.
2. **E-mail** : configurer SMTP dans `src/lib/email.ts` + génération PDF des billets (QR).
3. **Auth.js** : brancher l'authentification réelle sur le modèle `User`.
4. **Persistance des commandes** : écrire les `Order`/`Ticket` en base dans `api/checkout`.

## Déploiement

| Branche   | Cible                            | Mécanisme                              |
| --------- | -------------------------------- | -------------------------------------- |
| `develop` | gb10 → `appbetadev.ticketick.ch` | `.github/workflows/deploy-betadev.yml`  |
| `main`    | Jelastic → `ticketick.ch`        | manuel (voir plus bas)                  |

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

### Production — Jelastic → `ticketick.ch`

Le projet est configuré en **build standalone** (`output: "standalone"`) et fournit
un `Dockerfile`.

```bash
# Build de l'image
docker build -t ticketick .

# Lancement
docker run -p 3000:3000 --env-file .env ticketick
```

Sur Jelastic, utilisez l'environnement **Node.js** ou **Docker** :

```bash
npm ci
npm run build
npm run db:migrate      # applique les migrations
npm run start           # sert .next/standalone
```

---

Conçu en Suisse 🇨🇭
