/**
 * Coordonnées de l'acheteur gardées dans le navigateur, sur demande, pour
 * préremplir le prochain achat. Rien n'est envoyé au serveur.
 */
export interface Buyer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const BUYER_KEY = "ticketick.buyer.v1";

export function readBuyer(): Buyer | null {
  try {
    const raw = localStorage.getItem(BUYER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Buyer>;
    const buyer = {
      firstName: text(parsed.firstName),
      lastName: text(parsed.lastName),
      email: text(parsed.email),
      phone: text(parsed.phone),
    };
    return buyer.email || buyer.firstName || buyer.lastName ? buyer : null;
  } catch {
    return null;
  }
}

export function writeBuyer(buyer: Buyer): void {
  try {
    localStorage.setItem(
      BUYER_KEY,
      JSON.stringify({
        firstName: buyer.firstName.trim(),
        lastName: buyer.lastName.trim(),
        email: buyer.email.trim(),
        phone: buyer.phone.trim(),
      }),
    );
  } catch {
    // Navigation privée ou stockage plein : l'achat n'en dépend pas.
  }
}

export function clearBuyer(): void {
  try {
    localStorage.removeItem(BUYER_KEY);
  } catch {
    // Idem.
  }
}

function text(value: unknown): string {
  return typeof value === "string" ? value.slice(0, 200) : "";
}
