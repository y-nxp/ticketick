/**
 * Journal des publications (`PromotionPostLog`, docs/module-promotion.md,
 * §§ 3.2 et 8) : une ligne par action de la minuterie, jamais de jeton ni de
 * corps de réponse.
 *
 * `logPostAction` est le seul point d'écriture. Il ne reçoit que des champs
 * nommés et courts, construits par nous : le `detail` est une phrase de la
 * minuterie, pas un message de la plateforme. Par prudence, il retire en
 * plus tout ce qui ressemble à un jeton et tronque.
 *
 * Sans `server-only` ni Prisma : les tests s'en servent.
 */

export const POST_LOG_ACTIONS = [
  /** Réservation par la minuterie (SCHEDULED → PUBLISHING). */
  "claim",
  /** Appel à l'éditeur, réussi ou non. */
  "publish",
  /** Nouvelle tentative programmée, ou réessai demandé par l'organisateur. */
  "retry",
  /** Annulation au moment de publier (événement plus promouvable). */
  "cancel",
  /** Échec sans appel à l'éditeur (compte à reconnecter). */
  "fail",
  /** PUBLISHING resté sans issue : état inconnu, marqué à vérifier. */
  "orphan",
  /** Report pour respecter la limite de débit du compte. */
  "rate_limit",
] as const;
export type PostLogAction = (typeof POST_LOG_ACTIONS)[number];

export interface PostLogEntry {
  postId: string;
  action: PostLogAction;
  ok: boolean;
  httpStatus?: number | null;
  errorCode?: string | null;
  detail?: string | null;
}

export interface PostLogRow {
  postId: string;
  action: PostLogAction;
  ok: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  detail: string | null;
}

export type PostLogSink = (row: PostLogRow) => Promise<void>;

export const LOG_DETAIL_MAX = 200;
const ERROR_CODE_MAX = 64;

/** Ce qui ressemble à un secret : paramètre ou en-tête de jeton, jeton Meta, longue suite opaque. */
const SECRET_PATTERNS = [
  /(access_token|appsecret_proof|client_secret|token)=[^&\s]*/gi,
  /Bearer\s+\S+/gi,
  /\bEAA[A-Za-z0-9]{10,}/g,
  /[A-Za-z0-9_\-+/=]{32,}/g,
];

export function redactSecrets(value: string, mask = "[masqué]"): string {
  return SECRET_PATTERNS.reduce((text, pattern) => text.replace(pattern, mask), value);
}

function cleanDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  const text = redactSecrets(detail).replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > LOG_DETAIL_MAX ? `${text.slice(0, LOG_DETAIL_MAX - 1)}…` : text;
}

function cleanErrorCode(code: string | null | undefined): string | null {
  if (!code) return null;
  const text = redactSecrets(code, "REDACTED")
    .replace(/[^A-Za-z0-9_:./-]/g, "")
    .slice(0, ERROR_CODE_MAX);
  return text || null;
}

function cleanHttpStatus(status: number | null | undefined): number | null {
  return typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
}

/** Ligne telle qu'elle sera écrite. */
export function postLogRow(entry: PostLogEntry): PostLogRow {
  return {
    postId: entry.postId,
    action: entry.action,
    ok: entry.ok,
    httpStatus: cleanHttpStatus(entry.httpStatus),
    errorCode: cleanErrorCode(entry.errorCode),
    detail: cleanDetail(entry.detail),
  };
}

/**
 * Écrit une ligne. Un journal indisponible ne bloque pas la minuterie :
 * l'état de la publication, lui, est déjà écrit.
 */
export async function logPostAction(sink: PostLogSink, entry: PostLogEntry): Promise<void> {
  try {
    await sink(postLogRow(entry));
  } catch (error) {
    console.error(
      `[promotion] journal indisponible (${entry.action}, ${entry.postId})`,
      error instanceof Error ? error.name : "erreur",
    );
  }
}
