"use client";

import * as React from "react";
import { Link } from "@/i18n/navigation";
import { browseShowsHref, continueShoppingHref } from "@/lib/shop-origin";

function subscribeShopOrigin(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/**
 * Lien vers le spectacle d’origine (/go/… si on vient du portail), ou avec
 * `catalog` vers la liste des spectacles de l’organisateur.
 */
export function ContinueShopping({
  eventSlug,
  catalog = false,
  children,
  className,
  onClick,
}: {
  eventSlug?: string;
  catalog?: boolean;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const href = React.useSyncExternalStore(
    subscribeShopOrigin,
    () => (catalog ? browseShowsHref() : continueShoppingHref(eventSlug)),
    () => (!catalog && eventSlug ? `/events/${eventSlug}` : "/"),
  );

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
