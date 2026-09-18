function readTitle(value: unknown, locale: string): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const hit = record[locale] ?? record.fr ?? Object.values(record)[0];
    if (typeof hit === "string") return hit;
  }
  return "";
}

export type TicketOptionBlock = {
  heading: string;
  date: string;
  trips: string[];
  total: string;
};

type OptionSource = {
  title: string;
  summary: string;
  amountCents: number;
  option: {
    sessionId: string | null;
    title: unknown;
    hint: unknown;
    groups: {
      title: unknown;
      choices: { label: unknown }[];
    }[];
  };
};

/**
 * Texte d'option à imprimer sur un billet.
 *
 * Une option liée à une séance ne figure que sur les billets de cette
 * séance : sans cela, un aller-retour navette apparaîtrait aussi sur un
 * autre concert du même panier.
 */
export function optionBlocksForTicket(
  options: OptionSource[],
  sessionId: string,
  startsAt: Date,
  locale: string,
): TicketOptionBlock[] {
  const blocks: TicketOptionBlock[] = [];
  for (const row of options) {
    if (row.option.sessionId && row.option.sessionId !== sessionId) continue;
    const block = isShuttleOption(row, locale)
      ? shuttleBlock(row, startsAt, locale)
      : genericBlock(row, startsAt, locale);
    if (block) blocks.push(block);
  }
  return blocks;
}

function isShuttleOption(row: OptionSource, locale: string): boolean {
  const blob = [
    row.title,
    readTitle(row.option.title, locale),
    row.option.hint ? readTitle(row.option.hint, locale) : "",
    ...row.option.groups.map((g) => readTitle(g.title, locale)),
  ]
    .join(" ")
    .toLowerCase();
  if (/(navette|shuttle|minibus|navetta)/.test(blob)) return true;
  return row.option.groups.some((g) => directionOf(readTitle(g.title, locale)));
}

function shuttleBlock(
  row: OptionSource,
  startsAt: Date,
  locale: string,
): TicketOptionBlock | null {
  const trips = tripsFromRow(row, locale);
  if (trips.length === 0 && !row.summary.trim()) return null;
  return {
    heading: copy(locale).shuttleHeading,
    date: formatOptionDate(startsAt, locale),
    trips: trips.length > 0 ? trips : splitSummary(row.summary),
    total: copy(locale).payDriver(formatFrancs(row.amountCents)),
  };
}

function genericBlock(
  row: OptionSource,
  startsAt: Date,
  locale: string,
): TicketOptionBlock | null {
  const heading = row.title.trim();
  const trips = splitSummary(row.summary);
  if (!heading && trips.length === 0) return null;
  return {
    heading: heading || copy(locale).optionHeading,
    date: formatOptionDate(startsAt, locale),
    trips,
    total:
      row.amountCents > 0
        ? `${copy(locale).totalLabel} ${formatFrancs(row.amountCents)}`
        : "",
  };
}

function tripsFromRow(row: OptionSource, locale: string): string[] {
  const picked = splitSummary(row.summary);
  const trips: string[] = [];
  for (const label of picked) {
    const hit = findChoice(row, label, locale);
    if (!hit) {
      trips.push(label);
      continue;
    }
    const groupTitle = readTitle(hit.groupTitle, locale);
    const dir = directionOf(groupTitle) ?? copy(locale).trip;
    const route = stripDirection(groupTitle);
    const time =
      extractTime(readTitle(hit.choiceLabel, locale)) ||
      extractTime(label);
    const body = [time, route].filter(Boolean).join(" ");
    trips.push(body ? `1 ${dir} : ${body}` : `1 ${dir}`);
  }
  return trips;
}

function findChoice(
  row: OptionSource,
  label: string,
  locale: string,
): { groupTitle: unknown; choiceLabel: unknown } | null {
  const wanted = normalize(label);
  for (const group of row.option.groups) {
    for (const choice of group.choices) {
      if (normalize(readTitle(choice.label, locale)) === wanted) {
        return { groupTitle: group.title, choiceLabel: choice.label };
      }
    }
  }
  return null;
}

function directionOf(title: string): string | null {
  const head = title.trim();
  if (/^aller\b/i.test(head)) return "Aller";
  if (/^retour\b/i.test(head)) return "Retour";
  if (/^outbound\b/i.test(head)) return "Outbound";
  if (/^return\b/i.test(head)) return "Return";
  if (/^hin\b/i.test(head)) return "Hin";
  if (/^zur[uü]ck\b/i.test(head)) return "Zurück";
  if (/^andata\b/i.test(head)) return "Andata";
  if (/^ritorno\b/i.test(head)) return "Ritorno";
  return null;
}

function stripDirection(title: string): string {
  return title
    .replace(/^(aller|retour|outbound|return|hin|zurück|zuruck|andata|ritorno)\s+/i, "")
    .replaceAll("→", "->")
    .replaceAll("—", "-")
    .trim();
}

function extractTime(label: string): string {
  const fr = label.match(/\b(\d{1,2}h\d{2})\b/i);
  if (fr) return fr[1]!.toLowerCase();
  const clock = label.match(/\b(\d{1,2}:\d{2})\b/);
  if (clock) return clock[1]!;
  const en = label.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (en) {
    const hour = Number(en[1]);
    const min = en[2] ?? "00";
    const pm = en[3]!.toLowerCase() === "pm" && hour < 12;
    const h = pm ? hour + 12 : hour;
    return `${h}h${min}`;
  }
  return "";
}

function splitSummary(summary: string): string[] {
  return summary
    .split(" · ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function formatOptionDate(date: Date, locale: string): string {
  const raw = new Intl.DateTimeFormat(`${locale}-CH`, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Zurich",
  }).format(date);
  const plain = raw.replace(/[\u00a0\u202f]/g, " ").replace(/^([^,]+),\s+/, "$1 ");
  return plain ? plain.charAt(0).toUpperCase() + plain.slice(1) : plain;
}

function formatFrancs(cents: number): string {
  const value = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return `${value} CHF`;
}

function normalize(value: string): string {
  return value.replace(/[\u00a0\u202f]/g, " ").trim().toLowerCase();
}

function copy(locale: string) {
  const pack = {
    fr: {
      shuttleHeading: "Y compris service de navette par minibus",
      optionHeading: "Option",
      trip: "Course",
      totalLabel: "Total :",
      payDriver: (amount: string) =>
        `Total : ${amount} à payer directement au chauffeur`,
    },
    en: {
      shuttleHeading: "Including minibus shuttle service",
      optionHeading: "Option",
      trip: "Trip",
      totalLabel: "Total:",
      payDriver: (amount: string) =>
        `Total: ${amount} to pay directly to the driver`,
    },
    de: {
      shuttleHeading: "Inklusive Minibus-Shuttle",
      optionHeading: "Option",
      trip: "Fahrt",
      totalLabel: "Total:",
      payDriver: (amount: string) =>
        `Total: ${amount} direkt beim Fahrer zu zahlen`,
    },
    it: {
      shuttleHeading: "Compreso il servizio navetta in minibus",
      optionHeading: "Opzione",
      trip: "Corsa",
      totalLabel: "Totale:",
      payDriver: (amount: string) =>
        `Totale: ${amount} da pagare direttamente all'autista`,
    },
  } as const;
  return pack[locale as keyof typeof pack] ?? pack.fr;
}
