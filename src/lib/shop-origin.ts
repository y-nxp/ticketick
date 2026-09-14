export const SHOP_ORIGIN_COOKIE = "ticketick.shopOrigin.v1";

const STORAGE_KEY = SHOP_ORIGIN_COOKIE;
const COOKIE_MAX_AGE = 60 * 60 * 12;

export type GoShopOrigin = {
  orgSlug: string;
  eventSlug: string;
  path: string;
};

/** Cookie / chemin `/go/org/event` posé depuis le portail organisateur. */
export function parseGoOrigin(
  value: string | null | undefined,
): GoShopOrigin | null {
  if (!value) return null;
  let raw = value;
  try {
    raw = decodeURIComponent(value);
  } catch {
    // déjà décodé
  }
  const go = raw.match(/\/go\/([^/]+)\/([^/]+)/);
  if (!go) return null;
  return { orgSlug: go[1], eventSlug: go[2], path: `/go/${go[1]}/${go[2]}` };
}

export function isOrganizerCheckoutPath(pathname: string): boolean {
  return (
    pathname === "/cart" ||
    pathname.startsWith("/cart/") ||
    pathname === "/checkout" ||
    pathname.startsWith("/checkout/")
  );
}

/** Mémorise la page spectacle d’où l’on vient (/go/… ou /events/…). */
export function rememberShopOrigin(pathname: string) {
  if (typeof window === "undefined") return;
  const path = normalizeShopPath(pathname);
  if (!path) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, path);
  } catch {
    // ignore
  }
  document.cookie = `${SHOP_ORIGIN_COOKIE}=${encodeURIComponent(path)}; Path=/; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
}

export function continueShoppingHref(eventSlug?: string): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    const path = stored ? normalizeShopPath(stored) : null;
    if (path) return path;
  } catch {
    // ignore
  }
  if (typeof document !== "undefined") {
    const match = document.cookie.match(
      new RegExp(`(?:^|; )${SHOP_ORIGIN_COOKIE}=([^;]*)`),
    );
    if (match?.[1]) {
      const path = normalizeShopPath(decodeURIComponent(match[1]));
      if (path) return path;
    }
  }
  if (eventSlug) return `/events/${eventSlug}`;
  return "/";
}

export function normalizeShopPath(pathname: string): string | null {
  const clean = pathname.split("?")[0] ?? "";
  const go = parseGoOrigin(clean);
  if (go) return go.path;
  const event = clean.match(/\/events\/([^/]+)/);
  if (event) return `/events/${event[1]}`;
  return null;
}
