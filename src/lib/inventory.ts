/** Vue minimale d'une séance pour compter les places. */
export interface InventorySession {
  /** Jauge de salle, tous tarifs confondus. Absente : chaque tarif a son contingent. */
  capacity?: number | null;
  sold: number;
  ticketTypes: { quantity: number; sold: number; priceCents: number }[];
}

export interface InventoryTotals {
  capacity: number;
  sold: number;
  revenueCents: number;
}

/**
 * Additionne les places de plusieurs séances.
 *
 * Une jauge renseignée vaut pour tous les tarifs : sommer les contingents
 * compterait deux fois les places que le plein tarif et la gratuité se
 * partagent (350 + 350 pour une salle de 350).
 */
export function sumInventory(sessions: InventorySession[]): InventoryTotals {
  let capacity = 0;
  let sold = 0;
  let revenueCents = 0;

  for (const session of sessions) {
    if (session.capacity == null) {
      for (const tt of session.ticketTypes) {
        capacity += tt.quantity;
        sold += tt.sold;
      }
    } else {
      capacity += session.capacity;
      sold += session.sold;
    }
    for (const tt of session.ticketTypes) {
      revenueCents += tt.sold * tt.priceCents;
    }
  }

  return { capacity, sold, revenueCents };
}
