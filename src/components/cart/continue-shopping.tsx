"use client";

import * as React from "react";
import { Link } from "@/i18n/navigation";
import { continueShoppingHref } from "@/lib/shop-origin";

function subscribeShopOrigin(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  return () => window.removeEventListener("storage", onStoreChange);
}

/** Lien vers le spectacle d’origine (/go/… si on vient du portail). */
export function ContinueShopping({
  eventSlug,
  children,
  className,
  onClick,
}: {
  eventSlug?: string;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const href = React.useSyncExternalStore(
    subscribeShopOrigin,
    () => continueShoppingHref(eventSlug),
    () => (eventSlug ? `/events/${eventSlug}` : "/"),
  );

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
