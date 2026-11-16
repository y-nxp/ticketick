import { createHash, randomBytes } from "node:crypto";

/**
 * Clés de l'API publique : « tt_ » suivi de 32 caractères aléatoires.
 * Seule l'empreinte SHA-256 est stockée ; le préfixe affiché permet de
 * reconnaître une clé sans pouvoir la reconstituer.
 */

export const API_KEY_PREFIX = "tt_";
const KEY_PATTERN = /^tt_[A-Za-z0-9_-]{32}$/;

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 11), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isApiKeyShape(value: string): boolean {
  return KEY_PATTERN.test(value);
}

/** Clé lue dans `Authorization: Bearer …` ou, à défaut, `X-Api-Key`. */
export function readApiKey(headers: Headers): string | null {
  const auth = headers.get("authorization")?.trim();
  if (auth) {
    const match = /^Bearer\s+(\S+)$/i.exec(auth);
    return match ? match[1] : auth;
  }
  return headers.get("x-api-key")?.trim() || null;
}
