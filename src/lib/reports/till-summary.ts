/**
 * Rapport de la caisse sur place, calculé à partir des ventes (pur, testé).
 *
 * Chaque vente porte son moyen (`provider` de DoorSale) : collect = carte en
 * ligne, card_offline = carte hors ligne, twint_online / twint = TWINT en
 * ligne / hors ligne, cash = espèces, free = billets gratuits.
 */

export type TillBucket = "cardOnline" | "cardOffline" | "twintOnline" | "twintOffline" | "cash";
export const TILL_BUCKETS: TillBucket[] = ["cardOnline", "cardOffline", "twintOnline", "twintOffline", "cash"];

export interface TillPart {
  sales: number;
  cents: number;
}

export function bucketOf(provider: string): TillBucket | null {
  switch (provider) {
    case "collect":
      return "cardOnline";
    case "card_offline":
      return "cardOffline";
    case "twint_online":
      return "twintOnline";
    case "twint":
      return "twintOffline";
    case "cash":
      return "cash";
    default:
      return null;
  }
}

export interface TillSaleInput {
  provider: string;
  amountCents: number;
  sellerId: string | null;
  sellerName: string;
  lines: { name: string; quantity: number; unitPriceCents: number }[];
}

export interface TillSeller {
  id: string | null;
  name: string;
  sales: number;
  tickets: number;
  parts: Record<TillBucket, TillPart>;
  cents: number;
}

export interface TillSummary {
  sales: number;
  tickets: number;
  freeTickets: number;
  cents: number;
  parts: Record<TillBucket, TillPart>;
  tariffs: { name: string; unitPriceCents: number; quantity: number; cents: number }[];
  sellers: TillSeller[];
}

function emptyParts(): Record<TillBucket, TillPart> {
  return Object.fromEntries(TILL_BUCKETS.map((b) => [b, { sales: 0, cents: 0 }])) as Record<TillBucket, TillPart>;
}

export function summarizeTill(sales: TillSaleInput[]): TillSummary {
  const parts = emptyParts();
  const tariffs = new Map<string, { name: string; unitPriceCents: number; quantity: number; cents: number }>();
  const sellers = new Map<string, TillSeller>();
  let tickets = 0;
  let freeTickets = 0;
  let cents = 0;

  for (const sale of sales) {
    const bucket = bucketOf(sale.provider);
    const count = sale.lines.reduce((n, l) => n + l.quantity, 0);
    tickets += count;
    cents += sale.amountCents;
    if (bucket) {
      parts[bucket].sales += 1;
      parts[bucket].cents += sale.amountCents;
    }
    for (const line of sale.lines) {
      if (line.unitPriceCents === 0) freeTickets += line.quantity;
      // Même tarif à deux prix (changé en cours de soirée) : deux lignes.
      const key = `${line.name}\u0000${line.unitPriceCents}`;
      const row = tariffs.get(key) ?? { name: line.name, unitPriceCents: line.unitPriceCents, quantity: 0, cents: 0 };
      row.quantity += line.quantity;
      row.cents += line.quantity * line.unitPriceCents;
      tariffs.set(key, row);
    }
    const sellerKey = sale.sellerId ?? "";
    const seller =
      sellers.get(sellerKey) ??
      { id: sale.sellerId, name: sale.sellerName, sales: 0, tickets: 0, parts: emptyParts(), cents: 0 };
    seller.sales += 1;
    seller.tickets += count;
    seller.cents += sale.amountCents;
    if (bucket) {
      seller.parts[bucket].sales += 1;
      seller.parts[bucket].cents += sale.amountCents;
    }
    sellers.set(sellerKey, seller);
  }

  return {
    sales: sales.length,
    tickets,
    freeTickets,
    cents,
    parts,
    tariffs: [...tariffs.values()].sort((a, b) => b.unitPriceCents - a.unitPriceCents || a.name.localeCompare(b.name)),
    sellers: [...sellers.values()].sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)),
  };
}
