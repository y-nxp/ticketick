/**
 * Options choisies à l'achat (navette, repas…), séance par séance, pour que
 * l'organisateur prépare le service : combien de commandes et de personnes
 * par choix, et qui.
 *
 * La commande ne garde que le résumé des choix (`OrderOption.summary`), dans
 * la langue de l'acheteur : chaque morceau est rapproché des choix du
 * catalogue dans toutes les langues. Un libellé modifié depuis reste compté
 * tel quel, à part.
 */

export interface OptionCatalog {
  id: string;
  title: unknown;
  sortOrder: number;
  groups: { id: string; title: unknown; choices: { id: string; label: unknown }[] }[];
}

export interface OptionOrderInput {
  sessionId: string;
  option: OptionCatalog;
  summary: string;
  /** Billets de la commande pour cette séance : les personnes concernées. */
  people: number;
  order: { id: string; reference: string; name: string; phone: string | null; email: string };
}

export interface OptionChoiceCount {
  label: string;
  orders: number;
  people: number;
}

export interface OptionBuyer {
  orderId: string;
  reference: string;
  name: string;
  phone: string | null;
  email: string;
  people: number;
  choices: string[];
}

export interface SessionOptionReport {
  optionId: string;
  title: string;
  orders: number;
  people: number;
  groups: { title: string; choices: OptionChoiceCount[] }[];
  /** Choix dont le libellé n'existe plus au catalogue. */
  other: OptionChoiceCount[];
  buyers: OptionBuyer[];
}

export function readLabel(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hit = record[locale] || (locale === "es" ? record.en : "") || record.fr;
    if (typeof hit === "string") return hit;
    const first = Object.values(record).find((v) => typeof v === "string" && v);
    if (typeof first === "string") return first;
  }
  return typeof value === "string" ? value : "";
}

const normalize = (value: string) => value.replace(/[  ]/g, " ").trim().toLowerCase();

function labels(value: unknown): string[] {
  if (typeof value === "string") return [normalize(value)];
  if (!value || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .map(normalize);
}

/** Options d'une séance, dans l'ordre du catalogue ; les choix sans commande restent à 0. */
export function tallySessionOptions(
  rows: OptionOrderInput[],
  locale: string,
): Map<string, SessionOptionReport[]> {
  const bySession = new Map<string, Map<string, { report: SessionOptionReport; sortOrder: number }>>();

  for (const row of rows) {
    if (row.people <= 0) continue;
    const options =
      bySession.get(row.sessionId) ?? new Map<string, { report: SessionOptionReport; sortOrder: number }>();
    bySession.set(row.sessionId, options);
    let entry = options.get(row.option.id);
    if (!entry) {
      entry = {
        sortOrder: row.option.sortOrder,
        report: {
          optionId: row.option.id,
          title: readLabel(row.option.title, locale),
          orders: 0,
          people: 0,
          groups: row.option.groups.map((g) => ({
            title: readLabel(g.title, locale),
            choices: g.choices.map((c) => ({ label: readLabel(c.label, locale), orders: 0, people: 0 })),
          })),
          other: [],
          buyers: [],
        },
      };
      options.set(row.option.id, entry);
    }
    const report = entry.report;
    report.orders += 1;
    report.people += row.people;

    const picked: string[] = [];
    for (const part of row.summary.split(" · ").map((p) => p.trim()).filter(Boolean)) {
      const wanted = normalize(part);
      let count: OptionChoiceCount | undefined;
      row.option.groups.forEach((g, gi) => {
        g.choices.forEach((c, ci) => {
          if (!count && labels(c.label).includes(wanted)) count = report.groups[gi]!.choices[ci];
        });
      });
      if (!count) {
        count = report.other.find((o) => normalize(o.label) === wanted);
        if (!count) {
          count = { label: part, orders: 0, people: 0 };
          report.other.push(count);
        }
      }
      count.orders += 1;
      count.people += row.people;
      picked.push(count.label);
    }
    report.buyers.push({
      orderId: row.order.id,
      reference: row.order.reference,
      name: row.order.name,
      phone: row.order.phone,
      email: row.order.email,
      people: row.people,
      choices: picked,
    });
  }

  const out = new Map<string, SessionOptionReport[]>();
  for (const [sessionId, options] of bySession) {
    out.set(
      sessionId,
      [...options.values()].sort((a, b) => a.sortOrder - b.sortOrder).map((e) => e.report),
    );
  }
  return out;
}
