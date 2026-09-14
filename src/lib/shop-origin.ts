const KEY = "ticketick.shopOrigin.v1";

/** Mémorise la page spectacle d’où l’on vient (/go/… ou /events/…). */
export function rememberShopOrigin(pathname: string) {
  if (typeof window === "undefined") return;
  const path = normalizeShopPath(pathname);
  if (!path) return;
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // ignore
  }
}

export function continueShoppingHref(eventSlug?: string): string {
  try {
    const stored = sessionStorage.getItem(KEY);
    const path = stored ? normalizeShopPath(stored) : null;
    if (path) return path;
  } catch {
    // ignore
  }
  if (eventSlug) return `/events/${eventSlug}`;
  return "/";
}

function normalizeShopPath(pathname: string): string | null {
  const clean = pathname.split("?")[0] ?? "";
  const go = clean.match(/\/go\/([^/]+)\/([^/]+)/);
  if (go) return `/go/${go[1]}/${go[2]}`;
  const event = clean.match(/\/events\/([^/]+)/);
  if (event) {
    if (clean.includes("/embed/")) return `/events/${event[1]}`;
    return `/events/${event[1]}`;
  }
  return null;
}
