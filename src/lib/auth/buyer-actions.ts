"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import type { Buyer } from "@/lib/checkout/buyer";

/** Coordonnées du compte connecté, pour préremplir l'achat ; `null` sans session. */
export async function getAccountBuyer(): Promise<Buyer | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [firstName = "", ...rest] = (user.name ?? "").trim().split(/\s+/);
  return {
    firstName,
    lastName: rest.join(" "),
    email: user.email,
    phone: user.phone ?? "",
  };
}
