# Module Promotion pour organisateurs — étude et spécification

> Carte #120 · rédigée le 28.10.2026 · **documentation seule, aucun code**.
>
> Décision de départ (Yavuz, 28.10.2026) : le marketing de ticketick vise les
> **organisateurs** (B2B). La promotion d'un événement appartient à son
> organisateur ; ticketick lui donne l'outil pour la faire depuis son espace,
> sur **ses** réseaux, d'abord en organique puis en payant, avec un argument
> que personne d'autre n'a : ticketick voit les ventes, donc peut dire
> « cette campagne a vendu N billets pour X CHF ».

Conventions de ce document :

- Les chemins cités (`src/…`, `prisma/schema.prisma`) ont été relus dans le dépôt
  à la date de rédaction.
- **[Meta 28.10.2026]** : fait Meta vérifié le 28.10.2026 et fourni avec la carte.
- **[À vérifier]** : complément qui n'a pas pu être contrôlé sur
  developers.facebook.com lors de la rédaction (pas d'accès Web depuis
  l'environnement de travail). Ces points sont donnés comme hypothèses, avec la
  page de documentation où les confirmer, et doivent être relus avant le
  développement.
- Noms de modèles, de routes et de variables d'environnement : **propositions**.
  Aucun identifiant ni secret réel n'apparaît ici.

---

## 0. Résumé

| Phase | Contenu | Développement | Dépendance externe |
|---|---|---|---|
| 0 | Service manuel (offre « à la carte ») | aucun | aucune |
| 1 | MVP organique : bouton Promouvoir, connexion Facebook/Instagram, post généré depuis l'événement, programmation, **attribution au clic** | ~15 à 22 jours | App Review + Business Verification Meta pour ouvrir aux organisateurs |
| 2 | Boost payant + attribution complète (dépense, coût par billet) | ~18 à 28 jours | accès Marketing API (`ads_management`) |
| 3 | TikTok et autres | ~10 à 15 jours par plateforme | review propre à chaque plateforme |

Choix structurants proposés (détaillés plus bas) :

1. Le module vit dans le **backoffice existant `/admin`**, qui est déjà l'espace
   de l'organisateur (rôle `ORGANIZER`), et non dans `/organizer/dashboard`.
2. Les jetons de page sont **chiffrés au repos avec le mécanisme existant**
   (`src/lib/payment/seal.ts`, AES-256-GCM), selon le même motif `…Enc` que
   Stripe, PayPal et PostFinance.
3. **ticketick programme lui-même** les publications (file en base + minuterie,
   comme les rapports organisateur), y compris pour Facebook : un seul
   mécanisme, annulable, journalisé, identique pour Instagram qui n'a pas de
   programmation native **[À vérifier]**.
4. L'attribution repose sur un **lien de campagne propre à ticketick**
   (`/p/{code}` puis UTM), capté côté serveur et rattaché à la commande au
   moment de sa création. Phase 1 : dernier clic, même navigateur, sans pixel.
5. Du moteur marketing d'AI Manager, on **réutilise en service** la génération
   de visuels (et plus tard de clips et de légendes) ; tout ce qui touche aux
   comptes, jetons, données et ventes des organisateurs est **réimplémenté dans
   ticketick**.
6. Le **dossier Meta** (app, Business Verification, App Review) est lancé dès
   l'acceptation de cette spec : c'est le chemin critique, pas le code.

---

## 1. État des lieux dans le dépôt

### 1.1 Où vit l'espace organisateur aujourd'hui

| Élément | Emplacement | Constat |
|---|---|---|
| Backoffice | `src/app/[locale]/admin/layout.tsx` | Même ossature pour `ADMIN`, `ORGANIZER` et `ORGANIZER_VIEWER`. Titre « organisateur » quand `organizerView`. Menu : Vue d'ensemble, Événements, Commandes, Rapports, puis (hors lecteur) Rabais, Points de vente, Équipe, Contrôle, Réglages. Le layout ne protège rien : chaque page appelle elle-même le contrôle. |
| Ancien tableau de bord | `src/app/[locale]/organizer/dashboard/page.tsx` | Réservé à `ADMIN` (`requireRole(["ADMIN"])`), lit **tous** les événements publiés. Le commentaire le présente comme provisoire. **Ne pas y construire le module.** |
| Contrôles d'accès | `src/lib/auth/dal.ts` (`requireRole`, `requireCatalog`, `requireStats`) et `src/lib/admin/access.ts` (`catalogActor`, `statsActor`, `assertEventOwned`, `forbidIfForeignEvent`) | `catalogActor()` renvoie `organizerId` (filtre) pour un `ORGANIZER`, `null` pour l'admin. C'est le point d'entrée à réutiliser. |
| Double facteur | `src/lib/auth/second-factor.ts` | `ORGANIZER` et `ORGANIZER_VIEWER` exigent déjà un code par courriel : bonne base pour une fonction qui publie au nom de l'organisateur. |
| Usurpation (admin qui consulte un compte) | `Session.impersonatorId`, `CurrentUser.impersonator`, `src/components/admin/impersonation-banner.tsx` | À prendre en compte : un admin qui consulte un compte ne doit **pas** pouvoir lancer la connexion Facebook (il connecterait ses propres pages). |
| Création des comptes organisateurs | modèle `OrganizerInquiry` (commentaire) | Pas d'inscription libre : l'admin ouvre les accès. Le nombre d'organisateurs reste donc maîtrisé, ce qui simplifie la montée en charge côté Meta. |
| Fiche événement | `src/app/[locale]/admin/events/[id]/page.tsx` | Enchaîne `EventForm`, `ShareEmbed` (lien `/go/…`, script, iframe), `SessionsEditor`, `OptionsEditor`. |
| Liste des événements | `src/app/[locale]/admin/events/page.tsx` | Une ligne par événement, lien vers la fiche et vers la page `/go/{organisateur}`. |
| Lien de la page organisateur | `src/components/admin/organizer-page-share.tsx` | Texte d'aide existant : « Partagez ce lien sur votre site, vos réseaux ou vos courriels » (`messages/fr.json`). Le module prolonge ce geste. |
| Rapports | `src/app/[locale]/admin/reports/page.tsx` (via `statsActor`), `src/lib/reports/summary.ts` (`REPORT_SECTIONS = ["sales", "invitations", "remaining"]`), `src/lib/reports/report.ts` (envoi planifié) | Lieu naturel de la restitution « campagne → ventes ». |

### 1.2 Secrets chiffrés par organisateur : le motif existe

- `src/lib/payment/seal.ts` : `sealSecret` / `openSecret`, AES-256-GCM, IV aléatoire
  de 12 octets, clé dérivée par HKDF-SHA256 de `PAYMENT_SECRETS_KEY` (à défaut
  `AUTH_SECRET`), format `v1.<iv>.<tag>.<données>` en base64url. Changer la clé
  rend les secrets illisibles : il faut les ressaisir.
- `src/lib/payment/secret-box.ts` : réexport `server-only` pour l'application.
- Modèles qui l'utilisent (`prisma/schema.prisma`) : `OrganizerPostfinanceAccount.secretEnc`,
  `OrganizerStripeAccount.secretEnc` / `webhookSecretEnc`, `OrganizerPaypalAccount.secretEnc`.
  Tous en relation 1–1 avec `Organizer`, `onDelete: Cascade`, champ `enabled`.
- Règle de l'existant (`src/lib/admin/stripe-actions.ts`) : la clé ne repart
  jamais vers le navigateur ; un champ laissé vide conserve l'ancienne valeur.

**Conformité proposée** : les jetons Meta suivent exactement ce motif (champ
`tokenEnc`, chiffré par `sealSecret`, jamais exposé, ligne supprimée en
cascade avec l'organisateur). Seule différence : la connexion se fait par
OAuth **par l'organisateur lui-même**, alors que les comptes de paiement sont
saisis par l'admin (`requireAdmin`).

> Remarque d'implémentation : `seal.ts` vit sous `lib/payment` et dérive la
> clé avec l'étiquette `"payment-secrets"`. Le réutiliser tel quel est le plus
> simple et reste sûr. Un déplacement vers un module neutre (`lib/crypto/seal.ts`)
> avec une étiquette HKDF propre aux jetons sociaux pourra se faire au moment
> du développement ; il impose alors un format `v2` lisible à côté de `v1`.

### 1.3 Ce qui existe déjà côté Meta et mesure

- `Organizer.metaPixelId` et `ga4MeasurementId` (`src/lib/analytics/organizer-tags.ts`) :
  outils de l'organisateur, déclenchés sur ses seuls événements, **soumis au
  consentement** `ads` / `statistics` (`src/lib/analytics/consent.ts`, cookie `tt_consent`).
- Pixel et envoi serveur Meta **de ticketick** (`src/lib/analytics/meta-capi.ts`,
  `metaCapiConfig()` dans `config.ts`) : appel `graph.facebook.com/v23.0`, achat
  dédoublonné par `event_id = purchase:{référence}`, `_fbp`/`_fbc` lus dans
  `src/app/[locale]/checkout/success/page.tsx`.
- **Aucune gestion d'UTM** dans `src/` aujourd'hui (recherche `utm` sans résultat).
- Cookie d'origine de boutique (`src/lib/shop-origin.ts`, posé dans `src/proxy.ts`) :
  précédent utile — un cookie première partie de 12 h posé par le proxy à
  partir du chemin `/go/…`. L'attribution de campagne suivra la même mécanique.

### 1.4 Briques réutilisables

| Besoin du module | Brique existante |
|---|---|
| Tâche de fond (publier à l'heure dite) | `src/instrumentation.ts` démarre `startHoldJanitor`, `startResellerReports`, `startOrganizerReports` ; `src/lib/reports/report.ts` « réserve » chaque envoi par un `updateMany` conditionnel avant d'agir (pas de double envoi). |
| URL publique absolue | `publicAppOrigin()` et `reachableAppOrigin()` (`src/lib/app-url.ts`) ; `SITE_ORIGIN`, `eventPath()`, `localizedPath()` (`src/lib/seo/event.ts`). |
| Image publique pour Instagram | `/uploads/…` servi par `src/app/uploads/[...path]/route.ts` (`cache-control: public, immutable`) ; dépôt via `saveUploadedImage` (`src/lib/uploads.ts`, PNG/JPEG/WebP, 4 Mo). |
| Données du post | `Event.title/subtitle/description/coverImage/tags` (JSON multilingue, lu par `t()`), `EventSession.startsAt` (fuseau `EVENT_TIME_ZONE = "Europe/Zurich"`), `Venue.name/city`, `minPriceCents()` et `nextSession()` (`src/lib/types.ts`). |
| Aperçu de lien | métadonnées Open Graph des pages `/go/{org}/{event}` et `/events/{slug}` (`siteOpenGraph`, `src/lib/seo/site.ts`). |
| Courriels à l'organisateur | `src/lib/email` (nodemailer). |
| Code de campagne hors clic | modèle `Discount` (codes promo par organisateur/événement). |

---

## 2. Parcours organisateur

### 2.1 Qui peut faire quoi

| Rôle | Connecter un compte social | Composer / programmer | Voir les résultats |
|---|---|---|---|
| `ORGANIZER` | oui, pour **son** organisateur | oui, sur ses événements (`forbidIfForeignEvent`) | oui |
| `ORGANIZER_VIEWER` | non | non | oui (lecture, comme les rapports) |
| `ADMIN` | non (sauf pour les pages de ticketick elle-même) | oui, pour tout organisateur (support) | oui |
| `ADMIN` en consultation d'un compte | **non** — bouton désactivé avec explication | oui | oui |
| `DOOR_STAFF`, `RESELLER_AGENT`, `CUSTOMER` | non | non | non |

Toutes les actions serveur appellent `catalogActor()` (ou `statsActor()` pour la
lecture) et vérifient que l'événement et le compte social appartiennent au
même organisateur que l'acteur. Le menu du layout ne sert qu'à l'affichage.

### 2.2 Emplacements dans l'interface

1. **Menu `/admin`** : nouvelle entrée « Promotion » (`/admin/promotion`), visible
   pour `ORGANIZER`, `ORGANIZER_VIEWER` (lecture) et `ADMIN`. Elle regroupe :
   comptes connectés, publications (programmées, publiées, échouées), résultats
   par campagne.
2. **Fiche événement** `/admin/events/[id]` : section « Promouvoir » placée
   juste après `ShareEmbed` (même logique : diffuser l'événement). Elle affiche
   l'état (« Aucun compte connecté » → lien vers la connexion ; sinon bouton
   **Promouvoir** et les dernières publications de l'événement avec leurs ventes).
3. **Liste des événements** `/admin/events` : action « Promouvoir » sur la ligne,
   qui ouvre directement le compositeur de l'événement.

Le bouton n'est actif que si l'événement est promouvable :

- `Event.status = PUBLISHED` et au moins une séance à venir ;
- `Event.visibility` ∈ {`PUBLIC`, `UNLISTED`} — **jamais `MEMBERS`** (événement
  réservé à une communauté) ;
- si `onlineSale = false`, le post renvoie à la fiche (contact) et l'attribution
  de ventes est sans objet : l'interface le dit.

Un brouillon (`DRAFT`) peut être préparé, pas programmé.

### 2.3 Étape A — connecter sa page Facebook et son compte Instagram

Écran `/admin/promotion/comptes` :

1. L'organisateur clique « Connecter Facebook / Instagram ».
2. ticketick crée un `state` aléatoire, signé, lié à la session et à
   l'organisateur, valable 10 minutes (protection CSRF), et redirige vers la
   boîte de dialogue **Facebook Login for Business** avec la configuration de
   l'app (un `config_id` regroupant les permissions, plutôt qu'une liste
   `scope` **[À vérifier]** : developers.facebook.com/docs/facebook-login/facebook-login-for-business).
3. L'organisateur se connecte avec **son** compte Facebook, choisit la ou les
   pages (et le compte Instagram professionnel lié) qu'il autorise.
4. Retour sur une route proposée `src/app/api/promotion/meta/callback/route.ts` :
   vérification du `state`, de la session et du rôle ; échange du `code` contre
   un jeton utilisateur, puis lecture des pages autorisées et de leur jeton de
   page (`/me/accounts`), puis du compte Instagram lié à chaque page (champ
   `instagram_business_account`) **[À vérifier]** : developers.facebook.com/docs/pages-api/getting-started.
5. Si plusieurs pages : écran de choix. On enregistre **uniquement** les pages
   retenues ; le jeton utilisateur n'est pas conservé (ou, s'il s'avère
   nécessaire au renouvellement, chiffré de la même façon).
6. Les jetons de page sont chiffrés (`sealSecret`) et ne quittent jamais le serveur.
   On vérifie que la page accorde bien la tâche de création de contenu
   (`tasks` contient `CREATE_CONTENT`) **[À vérifier]** ; sinon message clair.
7. Déconnexion : bouton « Déconnecter » → révocation côté Meta autant que
   possible, puis suppression des jetons. Les publications passées et leurs
   statistiques de ventes sont conservées (elles appartiennent à l'historique).

Cas d'erreur à couvrir dans l'interface : refus de l'utilisateur, permissions
partiellement accordées, compte Instagram personnel (non professionnel),
page sans compte Instagram lié, jeton devenu invalide (mot de passe changé,
rôle retiré) → état « À reconnecter » + courriel à l'organisateur.

### 2.4 Étape B — composer le post depuis l'événement

Écran `/admin/promotion/nouveau?event={id}` (ou panneau sur la fiche) :

- **Séance** visée (par défaut `nextSession()`), ou « toutes les dates ».
- **Canaux** : Facebook, Instagram (cases selon les comptes connectés).
- **Langue** : celle du public visé (fr, de, en, it) ; elle détermine la langue
  du texte et le préfixe du lien (`localizedPath()`), car les pages `/go/…`
  s'ouvrent sinon en français (`hostedLocale` dans `src/proxy.ts`).
- **Texte généré** (modifiable) à partir de : titre (`Event.title`),
  sous-titre, date et heure à Zurich, lieu (`Venue.name`, `city`), « dès
  {prix} CHF » (`minPriceCents`), « Complet bientôt » si la jauge le justifie
  (facultatif), étiquettes `Event.tags` en mots-clics, lien d'achat.
  Phase 1 : gabarit déterministe, testable, sans IA. L'aide à la rédaction
  par le moteur d'AI Manager est une option (§ 6).
- **Visuel** : `coverImage` par défaut, une image de `gallery`, ou un visuel
  généré (§ 6). Formats prévus : carré 1:1 et portrait 4:5 pour le fil,
  vertical 9:16 plus tard pour les stories/reels.
- **Lien d'achat** : lien de campagne `https://ticketick.ch/p/{code}` (§ 5),
  qui mène à `/go/{organisateur}/{événement}` (page aux couleurs de
  l'organisateur, où son pixel éventuel s'applique) ou à `/events/{slug}`
  selon le choix de l'organisateur.
- **Aperçu** côte à côte « tel que sur Facebook » / « tel que sur Instagram »,
  avec les avertissements utiles : texte tronqué, lien **non cliquable dans une
  légende Instagram** (voir § 5.4), image recadrée.

### 2.5 Étape C — publier ou programmer

- « Publier maintenant » ou « Programmer » (date et heure, fuseau Zurich).
- À la validation : création d'une **campagne** (si c'est la première pour cet
  envoi) et d'une **publication par canal**, état `SCHEDULED`.
- La minuterie (§ 3.4) publie à l'heure ; l'écran des publications montre
  l'état, le lien vers le post (permalien) une fois publié, et l'erreur
  lisible en cas d'échec avec « Réessayer ».
- Une publication programmée peut être modifiée ou annulée jusqu'à sa prise en
  charge par la minuterie.
- Garde-fou au moment de publier : si l'événement n'est plus promouvable
  (annulé, complet, passé, devenu `MEMBERS`), la publication passe en
  `CANCELLED` avec le motif, et l'organisateur est prévenu.

---

## 3. Modèle de données

Ajouts proposés à `prisma/schema.prisma` (noms indicatifs, conventions du
fichier : `cuid()`, montants en centimes, commentaires `///` en français,
`onDelete: Cascade` depuis l'organisateur).

### 3.1 Connexions sociales

```prisma
enum SocialProvider {
  FACEBOOK_PAGE
  INSTAGRAM_BUSINESS
  /// Phase 3.
  TIKTOK
}

enum SocialAccountStatus {
  ACTIVE
  /// Jeton refusé par la plateforme : l'organisateur doit se reconnecter.
  NEEDS_RECONNECT
  /// Déconnecté par l'organisateur : jeton effacé, historique conservé.
  DISCONNECTED
}

/// Page Facebook ou compte Instagram professionnel d'un organisateur.
/// Le jeton n'est stocké que chiffré (même mécanisme que Stripe et PayPal) ;
/// il ne repart jamais vers le navigateur.
model OrganizerSocialAccount {
  id          String              @id @default(cuid())
  organizer   Organizer           @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  organizerId String
  provider    SocialProvider
  /// Identifiant de la page ou du compte chez la plateforme.
  externalId  String
  name        String
  username    String?
  pictureUrl  String?

  /// Jeton de page chiffré (`sealSecret`). Vide pour Instagram, qui publie
  /// avec le jeton de la page à laquelle il est lié (`viaAccount`).
  tokenEnc       String?
  tokenExpiresAt DateTime?
  viaAccount     OrganizerSocialAccount?  @relation("SocialVia", fields: [viaAccountId], references: [id], onDelete: Cascade)
  viaAccountId   String?
  linked         OrganizerSocialAccount[] @relation("SocialVia")

  /// Permissions effectivement accordées, relues après la connexion.
  scopes      String[]            @default([])
  status      SocialAccountStatus @default(ACTIVE)
  lastError   String?
  /// Utilisateur ticketick qui a fait la connexion.
  connectedById String?
  connectedAt   DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  posts PromotionPost[]

  @@unique([organizerId, provider, externalId])
  @@index([organizerId, status])
}
```

Une même page Facebook peut être connectée par deux organisateurs (agence,
coproduction) : l'unicité porte sur le triplet, pas sur `externalId` seul.

### 3.2 Campagnes, publications, journal

```prisma
enum PromotionKind {
  ORGANIC
  /// Phase 2.
  PAID
}

enum PromotionPostStatus {
  DRAFT
  SCHEDULED
  /// Prise en charge par la minuterie (réservation atomique).
  PUBLISHING
  PUBLISHED
  FAILED
  CANCELLED
}

/// Unité d'attribution : un lien, un code, des ventes. Une campagne peut
/// regrouper plusieurs publications (Facebook + Instagram, rappels).
model PromotionCampaign {
  id          String        @id @default(cuid())
  organizer   Organizer     @relation(fields: [organizerId], references: [id], onDelete: Cascade)
  organizerId String
  event       Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  eventId     String
  /// Séance mise en avant ; vide : toutes les dates.
  sessionId   String?
  /// Code court du lien `/p/{code}` et de `utm_campaign=tt-{code}`.
  code        String        @unique
  name        String
  kind        PromotionKind @default(ORGANIC)
  locale      String        @default("fr")
  /// Page d'arrivée : "go" (/go/org/event) ou "events" (/events/slug).
  landing     String        @default("go")

  /// Phase 2 : budget plafonné et dépense relevée chez Meta.
  budgetCents     Int?
  spentCents      Int?
  currency        String    @default("CHF")
  externalAdRefs  Json?
  approvedById    String?
  approvedAt      DateTime?

  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  posts  PromotionPost[]
  clicks PromotionClickDay[]
  orders Order[]

  @@index([organizerId, createdAt])
  @@index([eventId])
}

model PromotionPost {
  id          String                 @id @default(cuid())
  campaign    PromotionCampaign      @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  campaignId  String
  account     OrganizerSocialAccount @relation(fields: [accountId], references: [id])
  accountId   String

  status      PromotionPostStatus @default(DRAFT)
  scheduledAt DateTime?
  /// Texte final, tel que validé par l'organisateur.
  message     String
  /// Chemin `/uploads/…` du visuel retenu (copie figée, voir § 3.5).
  imagePath   String?
  /// Lien publié (`/p/{code}` avec `utm_source` du canal).
  linkUrl     String

  externalId  String?
  permalink   String?
  publishedAt DateTime?
  attempts    Int       @default(0)
  lastError   String?
  /// Réservation par la minuterie, pour ne pas publier deux fois.
  claimedAt   DateTime?

  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  log PromotionPostLog[]

  @@index([status, scheduledAt])
  @@index([campaignId])
}

/// Journal des appels à la plateforme : jamais de jeton ni de corps complet.
model PromotionPostLog {
  id         String        @id @default(cuid())
  post       PromotionPost @relation(fields: [postId], references: [id], onDelete: Cascade)
  postId     String
  /// "create_container", "publish", "status", "cancel"…
  action     String
  ok         Boolean
  httpStatus Int?
  /// Code et sous-code d'erreur de la plateforme.
  errorCode  String?
  detail     String?
  createdAt  DateTime @default(now())

  @@index([postId, createdAt])
}

/// Clics sur `/p/{code}`, agrégés par jour : aucune adresse IP ni identifiant.
model PromotionClickDay {
  campaign   PromotionCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  campaignId String
  day        DateTime          @db.Date
  source     String
  clicks     Int               @default(0)

  @@id([campaignId, day, source])
}
```

### 3.3 Rattachement des commandes

Sur `Order`, dans le bloc existant « Attribution de la vente » (à côté de
`channel`, `reseller`, `soldBy`) :

```prisma
  /// Campagne dont le lien a précédé l'achat (dernier clic, même navigateur).
  promotionCampaign   PromotionCampaign? @relation(fields: [promotionCampaignId], references: [id], onDelete: SetNull)
  promotionCampaignId String?
  /// Source du clic : "facebook", "instagram", "code"…
  promotionSource     String?
  promotionClickAt    DateTime?
```

avec `@@index([promotionCampaignId])`. Figé à la création de la commande,
jamais recalculé ensuite.

### 3.4 États et minuterie

```
DRAFT ──valider──▶ SCHEDULED ──heure atteinte, réservation──▶ PUBLISHING ──ok──▶ PUBLISHED
   │                  │  ▲                                       │
   └──annuler──▶ CANCELLED ◀──événement plus promouvable──────────┤
                      │  └──réessayer (attempts < 3)── FAILED ◀───┘ erreur
```

- Nouvelle minuterie `startPromotionPublisher()` déclarée dans
  `src/instrumentation.ts`, sur le modèle de `startOrganizerReports` : passe
  toutes les minutes, drapeau `running` contre le chevauchement.
- Réservation atomique comme dans `sendDueOrganizerReports` :
  `updateMany({ where: { id, status: "SCHEDULED", scheduledAt: { lte: now } }, data: { status: "PUBLISHING", claimedAt: now } })`
  et on ne publie que si `count === 1`. Une publication restée `PUBLISHING`
  plus de 15 minutes est examinée (lecture de l'état chez Meta) avant toute
  nouvelle tentative, pour ne **jamais publier deux fois**.
- Erreur transitoire (limite de débit, 5xx) : nouvelle tentative avec délai
  croissant, trois au plus. Erreur de jeton : compte `NEEDS_RECONNECT`,
  publication `FAILED`, courriel.

Pourquoi ne pas utiliser la programmation native de Facebook
(`scheduled_publish_time`) : Instagram n'en offre pas par l'API **[À vérifier]**,
deux mécanismes doubleraient les cas d'erreur, et une programmation chez
Facebook échappe aux garde-fous du § 2.5 (événement annulé entre-temps).

### 3.5 Visuels

Le visuel publié est **copié et figé** sous `/uploads/promotion/{organizerId}/…`
au moment de la validation : si l'organisateur change ensuite l'affiche de
l'événement, la publication programmée garde ce qu'il a validé. Le dossier
reste servi par la route `/uploads` existante, donc accessible publiquement,
ce qu'Instagram exige au moment de la publication **[Meta 28.10.2026]**.

---

## 4. Prérequis Meta

### 4.1 Faits vérifiés le 28.10.2026 (fournis avec la carte)

**Facebook Pages**

- Permission `pages_manage_posts`, avec ses dépendances `pages_read_engagement`
  et `pages_show_list`.
- L'**accès standard** ne couvre que les pages sur lesquelles on a soi-même un
  rôle (dans l'app). Pour publier sur les pages **des organisateurs**, il faut
  l'**accès avancé**, qui suppose **App Review + Business Verification**.
- Business Verification : environ **5 à 15 jours ouvrés**.
- App Review : de **quelques jours à quelques semaines** ; justification écrite
  et **capture vidéo par permission**.
- Ensuite : **Data Use Checkup annuel** (à ne pas manquer, sous peine de perdre
  l'accès).

**Instagram**

- Permission `instagram_business_content_publish`, **comptes professionnels
  seulement**, mêmes exigences de review.
- Limite de **50 publications par l'API par 24 h et par compte**.
- Le média doit être **accessible par une URL publique au moment de la publication**.

**Phase payante**

- `ads_management` / Marketing API, avec **ses propres paliers d'accès** :
  palier de développement limité, accès standard obtenu par review.

### 4.2 Compléments à confirmer sur developers.facebook.com **[À vérifier]**

Ces points n'ont pas pu être contrôlés lors de la rédaction. Ils sont listés
pour qu'on les vérifie avant le développement, chacun avec sa page de
référence ; aucun chiffre n'est avancé ici.

| Sujet | Hypothèse de travail | Où vérifier |
|---|---|---|
| Paliers Marketing API | Palier « développement » limité aux comptes publicitaires dont les membres de l'app sont administrateurs, avec quotas réduits ; « accès standard » obtenu après review, conditions d'usage minimal (volume d'appels, taux d'erreur) à lire précisément | developers.facebook.com/docs/marketing-api/overview/authorization et …/marketing-api/overview/rate-limiting |
| Permissions de la phase 2 | `ads_management` (créer/booster), `ads_read` (dépense, résultats), `business_management` selon la façon d'accéder aux comptes publicitaires de l'organisateur | developers.facebook.com/docs/permissions |
| Facebook Login for Business | Connexion par `config_id` ; jetons utilisateur ou jetons « utilisateur système » d'intégration selon la configuration | developers.facebook.com/docs/facebook-login/facebook-login-for-business |
| Durée des jetons de page | Un jeton de page obtenu à partir d'un jeton utilisateur longue durée n'expire pas tant que les droits ne changent pas | developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived |
| Publication Instagram | Deux temps : création d'un conteneur média, puis publication ; images en **JPEG** (nos uploads acceptent aussi PNG et WebP → conversion nécessaire) ; pas de programmation native | developers.facebook.com/docs/instagram-platform/content-publishing |
| Liens dans Instagram | Légendes non cliquables ; autocollant lien des stories non disponible par l'API | même page + documentation stories |
| Publication Facebook | Post texte + lien (aperçu Open Graph) ou photo + texte ; tâche `CREATE_CONTENT` requise sur la page | developers.facebook.com/docs/pages-api/posts |
| Sécurité des appels | `appsecret_proof` (HMAC du jeton par le secret de l'app) exigible dans les réglages de l'app ; jeton passé en en-tête plutôt qu'en paramètre d'URL | developers.facebook.com/docs/graph-api/securing-requests |
| Version de l'API Graph | Le dépôt utilise `v23.0` (`src/lib/analytics/meta-capi.ts`) ; une version expire environ deux ans après sa sortie. Centraliser la constante pour le module | developers.facebook.com/docs/graph-api/changelog |
| Exigences de l'app | URL de politique de confidentialité, instructions ou rappel de suppression des données, icône, catégorie | developers.facebook.com/docs/development/create-an-app et …/development/release |

### 4.3 Étapes concrètes du dossier Meta (à lancer tôt)

Elles conditionnent l'ouverture de la phase 1 aux organisateurs ; le code peut
avancer en parallèle.

1. **Trancher l'app** : app Meta commune Nextalp ou app ticketick dédiée
   (décision ouverte n° 2, § 9). Ce choix fixe aussi l'**entité juridique** à
   vérifier.
2. **Portefeuille Business** (Business Manager) au nom de cette entité, avec
   au moins deux administrateurs (éviter la dépendance à une personne).
3. **Business Verification** : documents officiels de l'entité (registre du
   commerce, adresse, domaine). Compter 5 à 15 jours ouvrés **[Meta 28.10.2026]**.
   Vérifier le domaine `ticketick.ch` dans le portefeuille.
4. **Créer l'app** (type « Business »), y ajouter les produits Facebook Login
   for Business et l'API Instagram ; renseigner politique de confidentialité
   (page `/privacy` existante, à compléter), suppression des données, icône.
5. **Développer en accès standard** (§ 4.4) jusqu'à un parcours complet
   démontrable.
6. **App Review** : une justification écrite et une **vidéo par permission**
   (`pages_manage_posts`, `pages_read_engagement`, `pages_show_list`,
   `instagram_business_content_publish`) montrant le parcours réel : connexion,
   choix de la page, aperçu, publication, résultat sur la page. Prévoir des
   allers-retours (quelques jours à quelques semaines **[Meta 28.10.2026]**).
7. **Passage en mode Live** de l'app, ouverture à un premier organisateur pilote.
8. **Phase 2** : nouvelle review pour `ads_management` et palier Marketing API
   (§ 4.2), à préparer dès que le boost est démontrable sur un compte
   publicitaire de test.
9. **Calendrier récurrent** : Data Use Checkup annuel, montée de version de
   l'API Graph, renouvellement des documents — à inscrire dans le suivi.

### 4.4 Ce qui se teste avant la review (accès standard)

- Toute personne ayant un **rôle dans l'app** (admin, développeur, testeur) peut
  connecter les pages dont elle est elle-même administratrice.
- Donc testable sans review : la **page Facebook de ticketick** et son compte
  Instagram professionnel ; la page d'un organisateur pilote **si** l'une de
  ses personnes accepte d'être ajoutée comme testeur de l'app et a un rôle sur
  la page.
- Tout le parcours (OAuth, choix de page, aperçu, programmation, publication,
  journal, attribution des ventes) se valide ainsi de bout en bout.
- Limite propre à nos environnements : les copies de test Tailscale ne sont
  pas joignables depuis Internet (`reachableAppOrigin()` renvoie `null` hors
  HTTPS public). Instagram ne pourra pas y lire les images ; Facebook ne
  pourra pas y produire l'aperçu des liens. Les essais de publication se font
  donc depuis la production (fonction masquée, réservée à l'admin) ou depuis
  une copie exposée en HTTPS.

---

## 5. Attribution bouclée « campagne → billets vendus »

C'est l'argument commercial central : il doit être juste, compréhensible et
honnête sur ses limites.

### 5.1 Principe

```
Post Facebook/Instagram
   │  lien https://ticketick.ch/p/{code}?s=fb
   ▼
/p/{code}  ── compte le clic (agrégé par jour, robots exclus)
   │         pose le cookie première partie « tt_cmp » = {code, source, horodatage}
   │ 302
   ▼
/go/{org}/{event}?utm_source=facebook&utm_medium=social&utm_campaign=tt-{code}&utm_content={post}
   │  (le proxy pose aussi « tt_cmp » si l'URL porte utm_campaign=tt-…,
   │   pour les liens copiés sans passer par /p/)
   ▼
Panier → /api/checkout → createOrder()
   │  lit « tt_cmp », vérifie la campagne et sa durée de validité,
   │  fige promotionCampaignId / promotionSource / promotionClickAt sur Order
   ▼
Commande payée (markOrderPaid) → comptée dans les résultats de la campagne
```

- Les **UTM** restent sur l'URL d'arrivée : l'organisateur retrouve ses
  campagnes dans son GA4 (`ga4MeasurementId`) ou dans Matomo, sans rien faire.
- Le **code** est propre à ticketick (`PromotionCampaign.code`), court, non
  devinable ; seul le format est validé dans le proxy, l'existence en base l'est
  à la création de commande.
- Robots exclus du comptage des clics : `facebookexternalhit` et autres
  robots d'aperçu suivent le lien pour fabriquer la vignette ; ils reçoivent la
  redirection mais ne sont pas comptés.
- Route `/p/{code}` : à placer en tenant compte du `matcher` de `src/proxy.ts`
  et du routage `next-intl` (la page doit répondre sans préfixe de langue).

### 5.2 Règles d'attribution (phase 1)

1. **Dernier clic de campagne** dans le même navigateur, fenêtre de **7 jours**
   (valeur à confirmer ; un spectacle se décide souvent en quelques jours).
   Un nouveau clic sur une autre campagne remplace le précédent.
2. Seul le canal `ONLINE` est attribué : ni guichet (`BOX_OFFICE`), ni point de
   vente (`RESELLER`), ni réservation admin.
3. La campagne n'est rattachée que si la commande contient au moins un billet
   **de l'organisateur de la campagne** (un panier peut mêler plusieurs
   organisateurs, cf. `bankDetails` dans `src/app/api/checkout/route.ts`).
4. Ne comptent dans les résultats que les commandes `PAID` ; une commande
   remboursée ou annulée sort des totaux (on affiche le net).
5. Restitution en deux lignes, jamais confondues :
   - **billets de l'événement promu** (le chiffre principal) ;
   - **autres spectacles du même organisateur** achetés dans la foulée.
6. Montant : billets de ces lignes (`OrderItem.unitPriceCents × quantity`),
   rabais (`OrderDiscount`) répartis au prorata, **frais de service exclus**
   (`feeCents`) — c'est l'argent de l'organisateur, pas celui de ticketick.
   Options de commande (`OrderOption`) affichées à part.
7. Billets gratuits (`FREE`, invitations) comptés en billets, pas en CHF.

### 5.3 Restitution à l'organisateur

- Page de la campagne (`/admin/promotion/{id}`) : publications et liens,
  **clics**, **commandes**, **billets**, **CHF**, taux clics → commandes, ventes
  par jour depuis la publication, par source (Facebook / Instagram / code).
- Phrase type en tête : « Cette campagne a vendu **N billets** pour
  **X CHF** (achats faits après un clic sur vos publications, dans les
  7 jours, sur le même appareil). »
- Section facultative « Promotion » dans le rapport courriel de l'organisateur
  (nouvelle valeur dans `REPORT_SECTIONS`, `src/lib/reports/summary.ts`).
- Sur la fiche commande admin : mention « Venue de la campagne … ».
- Phase 2 : ajout de la **dépense** (relevée par l'API Marketing) → **coût par
  billet** et **retour sur dépense**.

### 5.4 Ce que mesure ticketick, et ce qu'il ne mesure pas

À dire clairement dans l'interface et dans l'argumentaire :

- **Attribution au clic seulement** en phase 1. Une personne qui voit le post,
  ne clique pas, puis tape « ticketick » dans un moteur de recherche n'est pas
  attribuée. Les chiffres de ticketick sont donc un **plancher**, pas
  l'effet total de la campagne.
- **Même navigateur** : Facebook et Instagram ouvrent les liens dans leur
  navigateur intégré, dont les cookies sont séparés de Safari ou Chrome. Un
  clic dans Instagram suivi d'un achat le lendemain sur l'ordinateur n'est pas
  attribué.
- **Pas de pixel chez Meta** dans la boucle de la phase 1 : ticketick n'utilise
  ni le pixel de l'organisateur ni le sien pour attribuer. Le pixel de
  l'organisateur (`metaPixelId`) continue de fonctionner séparément, sous
  consentement ; en phase 2, Meta affichera ses propres conversions (avec vues
  et modélisation), qui **différeront** des chiffres de ticketick. On montre
  les deux en expliquant la différence, sans les additionner.
- **Partages** : un lien de campagne repartagé reste attribué à la campagne
  (acceptable, c'est un effet de la campagne).
- **Instagram organique** : les liens d'une légende ne sont pas cliquables
  **[À vérifier]**. Il reste le lien du profil (« lien en bio ») et, en
  complément, un **code de campagne** saisi au paiement, adossé au modèle
  `Discount` existant (code avec ou sans réduction, décision produit). Sans
  l'un de ces deux moyens, l'attribution Instagram organique sera faible :
  l'organisateur doit le savoir avant d'en attendre des chiffres.

### 5.5 Protection des données

- Le cookie `tt_cmp` ne contient ni identifiant de personne ni donnée
  personnelle : un code de campagne, une source, une date. Les clics sont
  agrégés par jour, sans IP.
- Il sert à mesurer le service rendu à l'organisateur, mais reste un traceur :
  la question du **consentement** (cookie fonctionnel ou catégorie
  `statistics` de `tt_consent`) et la mise à jour de la page `/privacy`
  doivent être validées avant la mise en production (voir § 8). Si le
  consentement est requis, l'alternative sans cookie est de transporter le
  code dans le stockage de session puis dans la requête de paiement, comme
  le fait `rememberShopOrigin` (`src/lib/shop-origin.ts`).
- Aucune donnée d'acheteur n'est envoyée à Meta par le module en phase 1.

---

## 6. Réutilisation du moteur marketing d'AI Manager

Contexte fourni avec la carte (ce dépôt n'a pas accès à AI Manager) : moteur
interne Nextalp avec studio de visuels (génération avec identité de marque et
logo, animation en clip), file de jobs, légendes, validation avant
publication, plafonds de budget avec approbation au-delà, configuration Meta
par marque. Les interfaces exactes sont **à confirmer avec ses mainteneurs**.

### 6.1 Ce qui se réutilise en service

| Capacité AI Manager | Usage dans ticketick | Phase |
|---|---|---|
| Génération de visuels avec identité de marque + logo | Visuel du post à partir de l'affiche (`coverImage`), des couleurs (`brandPrimary`, `brandAccent`, `brandBg`) et du logo (`logoUrl`) de l'organisateur, du titre, de la date et du lieu. Formats 1:1, 4:5, 9:16. Sortie **JPEG** (règle le point Instagram). | 1 (option) |
| File de jobs | Le travail de génération reste dans la file d'AI Manager ; ticketick dépose une demande, reçoit un identifiant, interroge ou reçoit un rappel. | 1 |
| Légendes | Proposition de texte à partir des données de l'événement, que l'organisateur modifie. Le gabarit déterministe de ticketick reste le défaut et le repli. | 1 (option) / 2 |
| Animation en clip | Courte vidéo verticale pour Reels / stories, puis TikTok. | 2–3 |

Contrat d'appel proposé (interne, serveur à serveur) :

- Appels **depuis le serveur ticketick uniquement**, jamais depuis le
  navigateur ; jeton de service propre à ticketick (variables proposées
  `AI_MANAGER_URL`, `AI_MANAGER_TOKEN`, valeurs hors dépôt).
- Entrée : données **publiques** de l'événement et charte de l'organisateur,
  URL des images sources, format voulu, langue. **Aucune donnée d'acheteur, aucun
  jeton Meta.**
- Sortie : image (ou clip) que ticketick **recopie** dans `/uploads/promotion/…` :
  l'URL publiée est toujours celle de ticketick, ce qui garantit la
  disponibilité au moment où Instagram la lit et découple les deux systèmes.
- Panne ou lenteur d'AI Manager : le compositeur propose l'affiche de
  l'événement ; la publication ne dépend jamais du service.
- Coûts : chaque génération est rattachée à l'organisateur (compteur côté
  ticketick) pour appliquer les limites décidées au § 9.

### 6.2 Ce qui se réimplémente dans ticketick

| Capacité | Pourquoi dans ticketick |
|---|---|
| OAuth multi-locataire (Facebook Login for Business) et stockage des jetons | Les jetons sont ceux **des organisateurs**, clients de ticketick ; ils doivent vivre dans la base de ticketick, chiffrés selon son motif (§ 1.2), supprimés avec l'organisateur. AI Manager raisonne « par marque Nextalp », pas « par client d'un client ». |
| Publication (appels Graph Pages / Instagram) | Liée aux jetons ci-dessus, à la minuterie et aux garde-fous propres aux événements (annulé, complet, `MEMBERS`). |
| Validation avant publication | Ici, c'est l'organisateur qui valide dans son espace ; le concept est le même, l'écran est celui de ticketick. |
| Plafonds de budget et approbation (phase 2) | Règles par organisateur, éventuellement facturation ; on reprend la **logique** (plafond, seuil d'approbation), pas les données. |
| Configuration Meta | Remplacée par la connexion OAuth de chaque organisateur. |
| Attribution des ventes | Seul ticketick voit les commandes. |

### 6.3 Frontières

```
┌──────────────────────────── ticketick (VPS, base PostgreSQL) ─────────────────────────────┐
│                                                                                            │
│  /admin (ORGANIZER)            Données par organisateur                 Minuterie          │
│  ├ Comptes connectés  ───────▶ OrganizerSocialAccount (tokenEnc) ◀──── startPromotion-     │
│  ├ Promouvoir (fiche) ───────▶ PromotionCampaign / PromotionPost        Publisher()        │
│  └ Résultats         ◀─────── Order.promotionCampaignId  ◀── createOrder()     │           │
│                                     ▲                                          │           │
│  /p/{code} ── clic ─▶ PromotionClickDay, cookie tt_cmp                         │           │
│                                                                                │           │
│  /uploads/promotion/…  (copie figée des visuels, URL publique)                 │           │
└──────────────┬───────────────────────────────────────────────────────────────┬─┴───────────┘
               │ demande de visuel / légende                                   │ Graph API
               │ (données publiques de l'événement,                            │ (jeton de page
               │  charte, aucune donnée acheteur)                              │  de l'organisateur)
               ▼                                                               ▼
┌────────────── AI Manager (Nextalp) ──────────────┐              ┌──── Meta ─────────────────┐
│ Studio de visuels · animation · légendes         │              │ Page Facebook             │
│ File de jobs                                     │              │ Instagram professionnel   │
│ (ne voit ni jetons Meta des organisateurs,       │              │ Marketing API (phase 2)   │
│  ni commandes, ni acheteurs)                     │              └───────────────────────────┘
└──────────────────────────────────────────────────┘
```

---

## 7. Phases

Estimations en jours de développement, pour une personne qui connaît le
dépôt, tests compris, hors délais Meta. Elles servent à décider, pas à
s'engager.

### Phase 0 — service manuel (aujourd'hui)

- **Périmètre** : l'équipe prépare et publie pour l'organisateur, dans le cadre
  de l'offre déjà présentée sur le site (« Une offre à la carte » :
  « Billetterie en ligne, communication ou prise en charge globale »,
  `messages/fr.json`). Aucun changement du site ni des textes de l'offre.
- **Effort** : aucun développement. Possibilité immédiate, sans code : créer à
  la main des liens avec `utm_campaign` pour préparer les habitudes de
  mesure (ils seront lus dans GA4/Matomo de l'organisateur, pas encore par
  ticketick).
- **Risques** : temps humain non extensible ; pas de chiffres de ventes par
  campagne dans ticketick.

### Phase 1 — MVP organique

- **Périmètre**
  - Modèles du § 3, migration Prisma.
  - Connexion Facebook Login for Business, choix des pages, compte Instagram
    lié, déconnexion, état « À reconnecter ».
  - Section « Promouvoir » sur la fiche, entrée « Promotion » au menu, action
    dans la liste des événements.
  - Compositeur : gabarit de texte multilingue depuis l'événement, choix du
    visuel, aperçus, publier / programmer / annuler.
  - Minuterie de publication, journal, courriels d'échec.
  - Lien `/p/{code}`, comptage des clics, cookie, rattachement dans
    `createOrder`, page de résultats, section de rapport.
  - Conversion JPEG des visuels pour Instagram (sans nouvelle dépendance si
    possible ; sinon via le service de visuels d'AI Manager, à arbitrer au
    développement).
  - Tests unitaires dans le style du dépôt (`src/**/*.test.ts`, `tsx --test`) :
    gabarit de texte, règles d'attribution (§ 5.2), transitions d'état,
    réservation de la minuterie, validation du `state` OAuth.
- **Découpage possible** : 1a ouvert à l'admin et aux pages de ticketick
  (accès standard) ; 1b ouvert aux organisateurs après App Review.
- **Effort** : ~15 à 22 jours (OAuth et gestion des jetons ~4–5 ; compositeur et
  aperçus ~4–6 ; publication, minuterie, journal ~3–4 ; attribution et
  résultats ~3–5 ; préparation de la review, vidéos ~1–2).
- **Risques**
  - App Review refusée ou longue : chemin critique, d'où le lancement immédiat
    du dossier.
  - Jetons invalidés à l'improviste (changement de mot de passe, rôle retiré
    sur la page) : géré par l'état `NEEDS_RECONNECT`, à surveiller.
  - Attribution Instagram faible (liens non cliquables) : à annoncer, code de
    campagne en complément.
  - Copies de test non joignables par Meta (§ 4.4).
  - Consentement du cookie d'attribution (§ 5.5).
  - Publication en double : prévenue par la réservation atomique et la
    vérification avant nouvelle tentative.

### Phase 2 — boost payant et attribution complète

- **Périmètre**
  - Connexion du **compte publicitaire** de l'organisateur (l'argent dépensé
    reste le sien, facturé par Meta) ; permission `ads_management`, lecture
    des résultats.
  - « Booster » une publication existante ou créer une annonce simple
    (audience géographique autour du lieu, âge, durée, budget total).
  - Plafond de budget par campagne et approbation au-delà d'un seuil (logique
    reprise d'AI Manager, § 6.2) ; double confirmation avant tout engagement
    de dépense.
  - Relevé quotidien de la dépense → `spentCents`, coût par billet, retour
    sur dépense ; affichage côte à côte des conversions Meta et des ventes
    ticketick (§ 5.4).
  - Option : envoi serveur des achats au pixel **de l'organisateur** (le code
    actuel `meta-capi.ts` ne sert que le pixel de ticketick), sous
    consentement `ads`, pour que Meta optimise ses annonces.
  - Clips animés (AI Manager) pour Reels.
- **Effort** : ~18 à 28 jours, plus une review dédiée et le palier Marketing API
  (§ 4.2).
- **Risques** : responsabilité en cas d'erreur de budget (d'où plafonds,
  confirmations, journal) ; règles publicitaires de Meta (catégories
  spéciales, refus d'annonces) ; écart de chiffres Meta / ticketick mal
  compris ; quotas du palier de développement pendant les essais.

### Phase 3 — TikTok et autres

- **Périmètre** : seulement si la demande des organisateurs existe. TikTok a
  une API de publication et une review propres ; le modèle prévoit
  `SocialProvider.TIKTOK` et l'attribution par lien fonctionne à l'identique.
  Contenu vidéo obligatoire → dépend des clips d'AI Manager.
- **Effort** : ~10 à 15 jours par plateforme, hors délais d'approbation.
- **Risques** : exigences d'audit de la plateforme, vidéo indispensable, faible
  retour si les publics des organisateurs n'y sont pas.

---

## 8. Sécurité et conformité (rappels pour le développement)

- Jetons : `sealSecret` au repos, déchiffrés au dernier moment, jamais dans les
  journaux, les erreurs, les props de composants ni les réponses d'API.
  L'appel existant de `meta-capi.ts` place le jeton dans l'URL : pour le
  module, préférer l'en-tête et `appsecret_proof` **[À vérifier]**, et ne
  jamais journaliser l'URL complète.
- OAuth : `state` signé lié à la session, usage unique, courte durée ;
  redirection de retour fixe (pas de paramètre libre).
- Toutes les actions passent par `catalogActor()` / `forbidIfForeignEvent()` ;
  connexion refusée pendant une consultation de compte par l'admin.
- Limites de débit : respect des 50 publications / 24 h / compte Instagram
  **[Meta 28.10.2026]** dans la minuterie ; limite interne par organisateur
  (décision n° 3).
- Données : suppression de l'organisateur → cascade sur comptes, campagnes,
  publications ; rappel de suppression des données exigé par Meta → efface
  les jetons de l'utilisateur concerné.
- Contenu : l'organisateur reste éditeur de ses publications ; mention dans
  les conditions organisateur à prévoir (hors de cette carte).
- Page `/privacy` : à compléter (connexion Meta, cookie d'attribution) avant
  l'ouverture — hors de cette carte, qui ne touche pas le site public.

---

## 9. Décisions ouvertes pour Yavuz

À trancher ; la spec ne les tranche pas.

1. **Modèle de prix** du module :
   - inclus dans une offre (abonnement organisateur) ;
   - pourcentage du budget publicitaire (phase 2) ;
   - pack (nombre de publications ou de visuels générés par mois / par
     événement) ;
   - ou combinaison (organique inclus, boost en pourcentage).
2. **App Meta commune Nextalp ou app ticketick dédiée** : elle fixe l'entité
   soumise à la Business Verification, le nom affiché aux organisateurs dans
   la fenêtre de connexion Facebook, le partage du risque (une suspension de
   l'app toucherait tous les produits qui la partagent) et la charge des
   reviews et Data Use Checkups.
3. **Limites par organisateur** : nombre de comptes connectés, de
   publications par jour (sous la limite Instagram de 50/24 h), de visuels
   générés par mois, plafond de budget de boost et seuil d'approbation en
   phase 2.

Points liés, à confirmer au même moment :

- fenêtre d'attribution (7 jours proposés) ;
- consentement du cookie d'attribution (fonctionnel ou soumis à
  `statistics`) ;
- code de campagne Instagram : avec ou sans réduction.
