"use server";

import { getCurrentUser } from "@/lib/auth/dal";

export interface CheckoutProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export async function getCheckoutProfile(): Promise<CheckoutProfile | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [firstName, ...rest] = (user.name ?? "").trim().split(/\s+/);
  return {
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    email: user.email,
    phone: user.phone ?? "",
  };
}
