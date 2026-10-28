import type { SocialAccountStatus, SocialProvider } from "@prisma/client";
import { demoProvider, demoPublisherAllowed } from "./demo-provider";

/**
 * Éditeur par fournisseur (docs/module-promotion.md, § 3.4) : ce qui publie
 * réellement une publication sur une page Facebook ou un compte Instagram.
 * La minuterie (`publisher.ts`) ne connaît que cette interface ; la machine
 * d'états, le journal et les courriels ne changent pas quand l'éditeur Meta
 * arrive (carte OAuth).
 *
 * Sans `server-only` ni Prisma : les tests s'en servent.
 */

/** Ce que l'éditeur reçoit d'une publication, relu juste après la réservation. */
export interface PublishablePost {
  id: string;
  message: string;
  /** Chemin `/uploads/…` du visuel figé ; à rendre absolu par l'éditeur. */
  imagePath: string | null;
  linkUrl: string;
  /** Appels déjà faits à l'éditeur pour cette publication (0 au premier). */
  attempts: number;
}

export interface PublishAccount {
  id: string;
  provider: SocialProvider;
  externalId: string;
  status: SocialAccountStatus;
  /**
   * Jeton chiffré par `sealSecret`, à déchiffrer dans l'éditeur au dernier
   * moment. Jamais journalisé, jamais copié dans une erreur.
   */
  tokenEnc: string | null;
  viaAccountId: string | null;
}

export interface PublishResult {
  externalId: string;
  permalink: string | null;
}

/**
 * Nature d'un échec, seule chose que la machine d'états regarde :
 * - `TRANSIENT` : limite de débit, 5xx, coupure ; nouvelle tentative plus tard ;
 * - `TOKEN` : jeton refusé ; le compte est à reconnecter ;
 * - `PERMANENT` : refus du contenu ou de la demande ; inutile de réessayer seul.
 */
export type ProviderErrorKind = "TRANSIENT" | "TOKEN" | "PERMANENT";

/** Code et sous-code numériques ou symboliques (« 190 », « 4/2207051 ») ; le reste est écarté. */
const PLATFORM_CODE = /^[A-Za-z0-9_]{1,24}(\/[A-Za-z0-9_]{1,24})?$/;

/**
 * Échec typé d'un éditeur. `message` reste interne et n'est jamais écrit
 * nulle part (il pourrait contenir une URL avec jeton) : le journal ne garde
 * que `kind`, `httpStatus` et `code`, nettoyés par `logPostAction`.
 */
export class PromotionProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly httpStatus: number | null;
  /** Code (et sous-code) d'erreur de la plateforme, par exemple « 190 » ou « 4/2207051 ». */
  readonly code: string | null;

  constructor(kind: ProviderErrorKind, options: { httpStatus?: number; code?: string; message?: string } = {}) {
    super(options.message ?? `promotion provider error (${kind})`);
    this.name = "PromotionProviderError";
    this.kind = kind;
    this.httpStatus = options.httpStatus ?? null;
    this.code = options.code && PLATFORM_CODE.test(options.code) ? options.code : null;
  }
}

export interface PromotionProvider {
  /** Nom court pour les journaux (« demo », « meta »). */
  readonly name: string;
  /** Publie, ou lève une `PromotionProviderError`. */
  publish(post: PublishablePost, account: PublishAccount): Promise<PublishResult>;
}

export type ProviderEnv = Partial<Record<"NODE_ENV" | "PROMOTION_DEMO_PUBLISHER", string | undefined>>;

/**
 * Point d'accrochage unique : l'éditeur qui publie pour ce compte, ou `null`
 * si aucun n'est disponible (la publication reste alors `SCHEDULED`).
 *
 * Aujourd'hui seul l'éditeur de démonstration existe, derrière son verrou
 * (`demoPublisherAllowed`, refus par défaut). La carte OAuth branchera ici
 * l'éditeur Meta pour `FACEBOOK_PAGE` et `INSTAGRAM_BUSINESS`, sans toucher
 * à la minuterie :
 *
 *   if (account.provider === "FACEBOOK_PAGE" || account.provider === "INSTAGRAM_BUSINESS") return metaProvider;
 */
export function resolveProvider(
  account: Pick<PublishAccount, "provider" | "externalId">,
  env: ProviderEnv = process.env,
): PromotionProvider | null {
  if (demoPublisherAllowed(account, env)) return demoProvider;
  return null;
}
