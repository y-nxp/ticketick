"use server";

import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/dal";
import { followOrganizersFromOrders } from "@/lib/auth/register-actions";

export interface MarketingState {
  error?: "unavailable";
  ok?: boolean;
}

export async function updateMarketingOptIn(
  _state: MarketingState | undefined,
  formData: FormData,
): Promise<MarketingState> {
  const user = await requireAuth("/account");
  const optIn = formData.get("marketingOptIn") === "on";

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        marketingOptIn: optIn,
        marketingOptInAt: optIn ? new Date() : null,
      },
    });
    if (optIn) {
      await followOrganizersFromOrders(user.id);
    } else {
      await prisma.organizerFollow.deleteMany({ where: { userId: user.id } });
    }
  } catch (error) {
    console.error("[account] offres", error);
    return { error: "unavailable" };
  }

  return { ok: true };
}

export async function getMarketingSettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      marketingOptIn: true,
      follows: {
        select: { organizer: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return {
    optIn: user?.marketingOptIn ?? false,
    organizers: user?.follows.map((f) => f.organizer) ?? [],
  };
}
