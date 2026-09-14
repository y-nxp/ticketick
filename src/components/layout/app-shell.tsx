"use client";

import { usePathname } from "@/i18n/navigation";
import { Footer } from "./footer";
import { Header } from "./header";

/**
 * Chrome ticketick (en-tête + pied). Masqué sur le widget iframe et sur
 * la page hébergée à la charte de l'organisateur.
 */
export function AppShell({
  accountSlot,
  children,
}: {
  accountSlot: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (isBarePath(pathname)) {
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

function isBarePath(pathname: string): boolean {
  return (
    pathname === "/embed" ||
    pathname.startsWith("/embed/") ||
    pathname === "/go" ||
    pathname.startsWith("/go/")
  );
}
