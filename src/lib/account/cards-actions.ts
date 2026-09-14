"use server";

import { requireAuth } from "@/lib/auth/dal";
import {
  deleteSavedCard,
  listSavedCards,
  type SavedCard,
} from "@/lib/payment/postfinance";

export async function getSavedCards(): Promise<SavedCard[]> {
  const user = await requireAuth("/account");
  try {
    return await listSavedCards(user.id);
  } catch (error) {
    console.error("[account] cartes PostFinance", error);
    return [];
  }
}

export interface CardState {
  error?: "unavailable";
  ok?: boolean;
}

export async function removeSavedCard(
  _state: CardState | undefined,
  formData: FormData,
): Promise<CardState> {
  const user = await requireAuth("/account");
  const id = Number(formData.get("tokenId"));
  if (!Number.isInteger(id) || id <= 0) return { error: "unavailable" };
  try {
    await deleteSavedCard(user.id, id);
  } catch (error) {
    console.error("[account] suppression carte", error);
    return { error: "unavailable" };
  }
  return { ok: true };
}
