"use client";

import * as React from "react";
import { Link } from "@/i18n/navigation";
import { continueShoppingHref } from "@/lib/shop-origin";

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
  const [href, setHref] = React.useState(
    eventSlug ? `/events/${eventSlug}` : "/",
  );

  React.useEffect(() => {
    setHref(continueShoppingHref(eventSlug));
  }, [eventSlug]);

  return (
    <Link href={href} className={className} onClick={onClick}>
      {children}
    </Link>
  );
}
