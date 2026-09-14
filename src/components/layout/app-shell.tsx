"use client";

import { usePathname } from "@/i18n/navigation";
import {
  isOrganizerCheckoutPath,
  parseGoOrigin,
} from "@/lib/shop-origin";
import { Footer } from "./footer";
import { Header } from "./header";

/**
 * Chrome ticketick (en-tête + pied). Masqué sur le widget iframe, la
 * page `/go`, et le paiement issu de ce portail.
 */
export function AppShell({
  accountSlot,
  shopOrigin,
  children,
}: {
  accountSlot: React.ReactNode;
  /** Cookie `/go/…` : garder la charte organisateur au checkout. */
  shopOrigin?: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (isBarePath(pathname, shopOrigin)) {
    return <main className="flex-1">{children}</main>;
  }

  return (
    <>
      <Header accountSlot={accountSlot} />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}

function isBarePath(pathname: string, shopOrigin?: string | null): boolean {
  if (
    pathname === "/embed" ||
    pathname.startsWith("/embed/") ||
    pathname === "/go" ||
    pathname.startsWith("/go/")
  ) {
    return true;
  }
  return (
    isOrganizerCheckoutPath(pathname) && parseGoOrigin(shopOrigin) != null
  );
}
