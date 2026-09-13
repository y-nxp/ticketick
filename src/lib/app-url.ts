/**
 * Origine publique du site, pour les liens envoyés hors du navigateur
 * (PostFinance, e-mails). `request.url` dans le conteneur vaut
 * http://0.0.0.0:3000 — inutilisable comme URL de retour.
 */
export function publicAppOrigin(request?: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured && !isLoopback(configured)) return configured;

  if (request) {
    const forwarded = forwardedOrigin(request);
    if (forwarded && !isLoopback(forwarded)) return forwarded;
  }

  return "https://ticketick.ch";
}

function forwardedOrigin(request: Request): string | undefined {
  const proto =
    header(request, "x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  const host = header(request, "x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return undefined;
  return `${proto}://${host}`;
}

function header(request: Request, name: string): string | null {
  return request.headers.get(name);
}

function isLoopback(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "0.0.0.0" || host === "127.0.0.1" || host === "localhost";
  } catch {
    return true;
  }
}
