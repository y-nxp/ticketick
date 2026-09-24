"use server";

import { requireAuth } from "@/lib/auth/dal";
import { consume } from "@/lib/rate-limit";
import { sendVerificationLink } from "./email-verification";

export type ResendState =
  | { ok: true }
  | { error: "throttled" | "unavailable" }
  | undefined;

export async function resendVerification(): Promise<ResendState> {
  const user = await requireAuth("/account");
  if (user.emailVerified) return { ok: true };
  if (!consume(`verify:${user.id}`, 3, 15 * 60_000)) {
    return { error: "throttled" };
  }
  try {
    await sendVerificationLink(user.id);
    return { ok: true };
  } catch (error) {
    console.error("[auth] renvoi du lien de confirmation", error);
    return { error: "unavailable" };
  }
}
