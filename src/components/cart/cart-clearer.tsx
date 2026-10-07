"use client";

import * as React from "react";
import { useCart } from "./cart-context";

/**
 * Vide le panier au montage (utilisé après un paiement confirmé). Attend que
 * le panier ait lu le stockage local : vidé avant, il serait aussitôt
 * rechargé avec l'ancien contenu.
 */
export function CartClearer() {
  const { clear, hydrated } = useCart();
  React.useEffect(() => {
    if (hydrated) clear();
  }, [clear, hydrated]);
  return null;
}
