import type { SocialProvider } from "@prisma/client";
import {
  PromotionProviderError,
  type PromotionProvider,
  type ProviderEnv,
  type PublishAccount,
  type PublishablePost,
  type PublishResult,
} from "./provider";

/**
 * Éditeur de démonstration (dry-run) : même interface que le futur éditeur
 * Meta, aucun appel réseau. Il sert aux tests et à dérouler la minuterie en
 * développement, en attendant la carte OAuth.
 *
 * Le résultat dépend d'un marqueur dans le texte de la publication :
 * - aucun marqueur : réussite, avec un identifiant et un permalien factices
 *   (domaine `.invalid`, qui ne se résout jamais) ;
 * - `[demo:transient]` : erreur transitoire à chaque appel ;
 * - `[demo:transient:2]` : erreur transitoire aux 2 premiers appels, puis réussite ;
 * - `[demo:token]` : jeton refusé ;
 * - `[demo:permanent]` : refus définitif.
 */

export const DEMO_ENV_FLAG = "PROMOTION_DEMO_PUBLISHER";
export const DEMO_ACCOUNT_PREFIX = "demo-";

/**
 * Verrou, refus par défaut : il faut `PROMOTION_DEMO_PUBLISHER=1`, et en
 * production un compte dont l'identifiant commence par `demo-`. Un vrai compte
 * de production n'est donc jamais « publié » pour de faux.
 */
export function demoPublisherAllowed(
  account: { provider: SocialProvider; externalId: string },
  env: ProviderEnv,
): boolean {
  if (env.PROMOTION_DEMO_PUBLISHER !== "1") return false;
  if (env.NODE_ENV === "production") return account.externalId.startsWith(DEMO_ACCOUNT_PREFIX);
  return true;
}

const MARKER = /\[demo:(transient|token|permanent)(?::(\d+))?\]/;

export const demoProvider: PromotionProvider = {
  name: "demo",
  async publish(post: PublishablePost, account: PublishAccount): Promise<PublishResult> {
    const marker = MARKER.exec(post.message);
    if (marker) {
      const [, kind, times] = marker;
      if (kind === "token") throw new PromotionProviderError("TOKEN", { httpStatus: 400, code: "190" });
      if (kind === "permanent") throw new PromotionProviderError("PERMANENT", { httpStatus: 400, code: "100" });
      if (times === undefined || post.attempts < Number(times)) {
        throw new PromotionProviderError("TRANSIENT", { httpStatus: 503, code: "2" });
      }
    }
    const externalId = `demo-${account.externalId}-${post.id}`;
    return { externalId, permalink: `https://demo.invalid/promotion/${encodeURIComponent(externalId)}` };
  },
};
