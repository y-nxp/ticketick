"use server";

import { prisma } from "@/lib/prisma";
import { t, type Translated } from "@/lib/types";

export type CheckoutOptionChoice = {
  id: string;
  label: string;
};

export type CheckoutOptionGroup = {
  id: string;
  title: string;
  required: boolean;
  choices: CheckoutOptionChoice[];
};

export type CheckoutOption = {
  id: string;
  title: string;
  hint: string | null;
  priceCents: number;
  priceMode: "FLAT" | "PER_CHOICE";
  groups: CheckoutOptionGroup[];
};

function asTranslated(value: unknown): Translated {
  const v = (value ?? {}) as Partial<Translated>;
  const fr = v.fr ?? "";
  return { fr, en: v.en ?? fr, de: v.de ?? fr, it: v.it ?? fr };
}

/** Options activées pour les séances présentes dans le panier. */
export async function getCheckoutOptions(
  sessionIds: string[],
  locale: string,
): Promise<CheckoutOption[]> {
  const ids = [...new Set(sessionIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const sessions = await prisma.eventSession.findMany({
    where: { id: { in: ids } },
    select: { id: true, eventId: true },
  });
  if (sessions.length === 0) return [];

  const eventIds = [...new Set(sessions.map((s) => s.eventId))];
  const knownSessions = new Set(sessions.map((s) => s.id));

  const options = await prisma.eventOption.findMany({
    where: {
      enabled: true,
      eventId: { in: eventIds },
      OR: [{ sessionId: null }, { sessionId: { in: [...knownSessions] } }],
    },
    orderBy: { sortOrder: "asc" },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        include: { choices: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });

  return options
    .filter((o) => !o.sessionId || knownSessions.has(o.sessionId))
    .map((o) => ({
      id: o.id,
      title: t(asTranslated(o.title), locale),
      hint: o.hint ? t(asTranslated(o.hint), locale) : null,
      priceCents: o.priceCents,
      priceMode: o.priceMode,
      groups: o.groups.map((g) => ({
        id: g.id,
        title: t(asTranslated(g.title), locale),
        required: g.required,
        choices: g.choices.map((c) => ({
          id: c.id,
          label: t(asTranslated(c.label), locale),
        })),
      })),
    }));
}
