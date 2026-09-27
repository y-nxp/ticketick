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
| `PF_CHECKOUT_SPACE_ID` / `PF_CHECKOUT_USER` / `PF_CHECKOUT_SECRET` | PostFinance de l'organisateur (billets, sans marge) |
| `STRIPE_*` | Facturation des organisateurs (plus tard), pas les billets |
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

1. **PostFinance Checkout** : renseigner `PF_CHECKOUT_*`. Le paiement carte crée
   une transaction (`src/lib/payment/postfinance.ts`) et redirige vers la page
   hébergée. Le webhook (`/api/webhooks/postfinance`) et le retour acheteur
   soldent la commande puis envoient les billets. Dans le portail : Webhook URL
   + listener `pf_paid`, entité Transaction. Les spectacles se distinguent
   par la référence `{slug}:{commande}`.
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
l'application et Caddy, qui obtient seul le certificat HTTPS.

**Valeurs GitHub**

- Secrets `PROD_SERVER_HOST`, `PROD_SERVER_USER`, `PROD_SERVER_SSH_KEY` (clé
  privée dont la clé publique est dans `authorized_keys` du serveur) et
  `PROD_SERVER_PORT` (22 par défaut). `JELASTIC_PROD_HOST` et
  `JELASTIC_PROD_USER` servent à défaut. L'utilisateur doit pouvoir lancer
  `docker` (root ou groupe `docker`).
- Encaissement et courriel : `PF_CHECKOUT_*`, `SMTP_*`, `PROD_BANK_IBAN`,
  `PROD_BANK_BENEFICIARY`.
- IA de l'import de plans : hors du GB10, l'application joint aimanager par
  son adresse publique. Secret `LITELLM_API_KEY` (clé « jelastic » du projet
  ticketick, révocable seule), variables `LITELLM_API_URL`
  (`https://api-ai.nextalp.com/v1/chat/completions`) et `PLAN_AI_MODEL`.
- Facultatif : variable `PROD_SITE_ADDRESS` (défaut `ticketick.ch`), par
  exemple `ticketick.ch, nouveau.ticketick.ch` pour essayer le serveur sur un
  nom de test avant la bascule.

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
