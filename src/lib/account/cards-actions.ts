"use server";

import { requireAuth } from "@/lib/auth/dal";
import {
  deleteSavedCard,
  listSavedCards,
  type SavedCard,
} from "@/lib/payment/postfinance";
import { enabledPostfinanceAccounts } from "@/lib/payment/postfinance-account";

/** Une carte n'est enregistrée que dans l'espace de l'organisateur payé. */
export interface OrganizerSavedCard extends SavedCard {
  organizerId: string;
  organizerName: string;
}

export async function getSavedCards(): Promise<OrganizerSavedCard[]> {
  const user = await requireAuth("/account");
  const accounts = await enabledPostfinanceAccounts();
  const lists = await Promise.all(
    accounts.map(async (account) => {
      try {
        const cards = await listSavedCards(account, user.id);
        return cards.map((card) => ({
          ...card,
          organizerId: account.organizerId,
          organizerName: account.organizerName,
        }));
      } catch (error) {
        console.error("[account] cartes PostFinance", account.organizerId, error);
        return [];
      }
    }),
  );
  return lists.flat();
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
  const organizerId = String(formData.get("organizerId") ?? "");
  if (!Number.isInteger(id) || id <= 0) return { error: "unavailable" };
  const account = (await enabledPostfinanceAccounts()).find(
    (a) => a.organizerId === organizerId,
  );
  if (!account) return { error: "unavailable" };
  try {
    await deleteSavedCard(account, user.id, id);
  } catch (error) {
    console.error("[account] suppression carte", error);
    return { error: "unavailable" };
  }
  return { ok: true };
}
