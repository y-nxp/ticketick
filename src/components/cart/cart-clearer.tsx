"use client";

import * as React from "react";
import { useCart } from "./cart-context";

/** Vide le panier au montage (utilisé après un paiement confirmé). */
export function CartClearer() {
  const { clear } = useCart();
  React.useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
