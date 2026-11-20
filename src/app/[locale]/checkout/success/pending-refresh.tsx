"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Paiement pas encore confirmé : la page se recharge toute seule pendant
 * quelques minutes, le temps que la confirmation du prestataire arrive.
 */
export function PendingRefresh({ everyMs = 4000, forMs = 3 * 60 * 1000 }) {
  const router = useRouter();
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - started > forMs) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, everyMs);
    return () => clearInterval(timer);
  }, [router, everyMs, forMs]);
  return null;
}
