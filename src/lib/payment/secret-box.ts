import "server-only";

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Chiffrement des secrets de prestataires stockés en base (AES-256-GCM).
 *
 * La clé vient de `PAYMENT_SECRETS_KEY`, à défaut d'`AUTH_SECRET` : une copie
 * de la base seule ne suffit pas à s'en servir. Changer cette clé rend les
 * secrets illisibles ; il faut alors les saisir à nouveau dans l'admin.
 */

function key(): Buffer {
  const material = process.env.PAYMENT_SECRETS_KEY?.trim() || process.env.AUTH_SECRET?.trim();
  if (!material) throw new Error("PAYMENT_SECRETS_KEY ou AUTH_SECRET manquant");
  return Buffer.from(
    hkdfSync("sha256", material, "ticketick", "payment-secrets", 32),
  );
}

export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(".");
}

export function openSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("secret illisible");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
