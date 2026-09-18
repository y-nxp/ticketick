import "server-only";

import { prisma } from "@/lib/prisma";
import { t, type Translated } from "@/lib/types";
import type { OptionSelectionInput } from "./option-types";

export type { OptionSelectionInput };

export type ResolvedOption = {
  optionId: string;
  title: string;
  summary: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
  paymentLabel: string;
};

export type OptionError =
  | "option_unavailable"
  | "option_incomplete"
  | "option_invalid";

function asTranslated(value: unknown): Translated {
  const v = (value ?? {}) as Partial<Translated>;
  const fr = v.fr ?? "";
  return { fr, en: v.en ?? fr, de: v.de ?? fr, it: v.it ?? fr };
}

/**
 * Relit les options en base et calcule le montant.
 *
 * Le client n'envoie que des identifiants : le prix et les libellés viennent
 * du catalogue, comme pour les billets.
 */
export async function resolveOrderOptions(args: {
  sessionIds: string[];
  selections: OptionSelectionInput[];
  locale: string;
}): Promise<
  | { ok: true; rows: ResolvedOption[] }
  | { ok: false; error: OptionError }
> {
  const wanted = dedupeSelections(args.selections);
  if (wanted.length === 0) return { ok: true, rows: [] };

  const options = await prisma.eventOption.findMany({
    where: { id: { in: wanted.map((s) => s.optionId) } },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        include: { choices: { orderBy: { sortOrder: "asc" } } },
      },
    },
  });
  const byId = new Map(options.map((o) => [o.id, o]));
  const sessions = new Set(args.sessionIds);
  const rows: ResolvedOption[] = [];

  for (const selection of wanted) {
    const option = byId.get(selection.optionId);
    if (!option || !option.enabled) {
      return { ok: false, error: "option_unavailable" };
    }
    if (option.sessionId && !sessions.has(option.sessionId)) {
      return { ok: false, error: "option_unavailable" };
    }

    const choiceById = new Map(
      option.groups.flatMap((g) => g.choices.map((c) => [c.id, { group: g, choice: c }])),
    );
    const picked = new Map<string, (typeof option.groups)[number]["choices"][number]>();

    for (const choiceId of selection.choiceIds) {
      const hit = choiceById.get(choiceId);
      if (!hit) return { ok: false, error: "option_invalid" };
      if (picked.has(hit.group.id)) return { ok: false, error: "option_invalid" };
      picked.set(hit.group.id, hit.choice);
    }

    if (option.groups.length > 0 && picked.size === 0) {
      return { ok: false, error: "option_incomplete" };
    }
    for (const group of option.groups) {
      if (group.required && !picked.has(group.id)) {
        return { ok: false, error: "option_incomplete" };
      }
    }

    const labels = option.groups
      .map((g) => picked.get(g.id))
      .filter(Boolean)
      .map((c) => t(asTranslated(c!.label), args.locale));
    const title = t(asTranslated(option.title), args.locale);
    const summary = labels.join(" · ");
    const quantity =
      option.priceMode === "PER_CHOICE" ? Math.max(1, picked.size) : 1;
    const unit = Math.max(0, option.priceCents);
    const amountCents = unit * quantity;

    rows.push({
      optionId: option.id,
      title,
      summary,
      quantity,
      unitPriceCents: unit,
      amountCents,
      paymentLabel: summary ? `${title} — ${summary}` : title,
    });
  }

  return { ok: true, rows };
}

function dedupeSelections(
  selections: OptionSelectionInput[],
): OptionSelectionInput[] {
  const seen = new Set<string>();
  const out: OptionSelectionInput[] = [];
  for (const selection of selections) {
    if (seen.has(selection.optionId)) continue;
    seen.add(selection.optionId);
    out.push({
      optionId: selection.optionId,
      choiceIds: [...new Set(selection.choiceIds.filter(Boolean))],
    });
  }
  return out;
}
