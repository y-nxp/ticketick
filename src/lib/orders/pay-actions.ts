"use server";

import { redirect } from "next/navigation";
import { locales, type Locale } from "@/i18n/routing";
import type { FormState } from "@/lib/admin/types";
import { publicAppOrigin } from "@/lib/app-url";
import { startLinkPayment } from "./charges";

/** Bouton « Payer » du lien : la transaction s'ouvre maintenant. */
export async function startPayAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  const raw = String(formData.get("locale") ?? "fr");
  const locale: Locale = (locales as readonly string[]).includes(raw)
    ? (raw as Locale)
    : "fr";
  const result = await startLinkPayment({ token, locale, origin: publicAppOrigin() });
  if (!result.ok) return { ok: false, error: result.error };
  redirect(result.url);
}
