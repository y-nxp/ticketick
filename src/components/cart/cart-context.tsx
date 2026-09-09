"use client";

import * as React from "react";

export interface CartLine {
  ticketTypeId: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  /** Séance concernée : un même spectacle peut être joué à plusieurs dates. */
  sessionId: string;
  sessionStartsAt: string;
  ticketName: string;
  unitPriceCents: number;
  currency: string;
  quantity: number;
  coverImage: string;
}

interface CartState {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  updateQuantity: (ticketTypeId: string, quantity: number) => void;
  remove: (ticketTypeId: string) => void;
  clear: () => void;
  count: number;
  subtotalCents: number;
}

const CartContext = React.createContext<CartState | null>(null);
// v2 : les lignes portent désormais la séance. Changer la clé écarte les
// paniers au format précédent plutôt que de les faire planter à l'affichage.
const STORAGE_KEY = "ticketick.cart.v2";

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = React.useState<CartLine[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    // Hydratation unique depuis le stockage local (indisponible côté serveur).
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLines(JSON.parse(raw));
    } catch {
      // ignore
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  }, [lines, hydrated]);

  const add: CartState["add"] = React.useCallback((line, quantity = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.ticketTypeId === line.ticketTypeId);
      if (existing) {
        return prev.map((l) =>
          l.ticketTypeId === line.ticketTypeId
            ? { ...l, quantity: l.quantity + quantity }
            : l,
        );
      }
      return [...prev, { ...line, quantity }];
    });
  }, []);

  const updateQuantity: CartState["updateQuantity"] = React.useCallback(
    (ticketTypeId, quantity) => {
      setLines((prev) =>
        quantity <= 0
          ? prev.filter((l) => l.ticketTypeId !== ticketTypeId)
          : prev.map((l) =>
              l.ticketTypeId === ticketTypeId ? { ...l, quantity } : l,
            ),
      );
    },
    [],
  );

  const remove: CartState["remove"] = React.useCallback((ticketTypeId) => {
    setLines((prev) => prev.filter((l) => l.ticketTypeId !== ticketTypeId));
  }, []);

  const clear = React.useCallback(() => setLines([]), []);

  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotalCents = lines.reduce(
    (sum, l) => sum + l.quantity * l.unitPriceCents,
    0,
  );

  const value: CartState = {
    lines,
    add,
    updateQuantity,
    remove,
    clear,
    count,
    subtotalCents,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
