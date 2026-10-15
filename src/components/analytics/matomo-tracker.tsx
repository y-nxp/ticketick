"use client";

import * as React from "react";
import { usePathname } from "@/i18n/navigation";
import { matomoPageView } from "@/lib/analytics/matomo";

/**
 * Page vue Matomo à l'arrivée et à chaque changement d'adresse. Le titre de
 * la nouvelle page est posé après le rendu, et une fiche de spectacle déclare
 * son produit au montage : la page vue part donc un instant plus tard.
 */
export function MatomoTracker() {
  const pathname = usePathname();

  React.useEffect(() => {
    const timer = setTimeout(matomoPageView, 150);
    return () => clearTimeout(timer);
  }, [pathname]);

  return null;
}
