import { createHash } from "node:crypto";
import { metaCapiConfig } from "./config";

// Une version de l'API Graph expire environ deux ans après sa sortie.
const GRAPH_VERSION = "v23.0";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Format attendu par Meta : chiffres seuls, indicatif pays compris. */
function normalizePhone(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = `41${digits.slice(1)}`;
  return digits.length >= 8 ? digits : null;
}

export interface MetaPurchase {
  reference: string;
  valueCents: number;
  currency: string;
  items: { id: string; quantity: number; priceCents: number }[];
  email: string;
  phone: string | null;
  firstName: string;
  lastName: string;
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  sourceUrl: string;
}

/**
 * Achat confirmé, envoyé par le serveur en plus du pixel : il est compté même
 * quand le navigateur bloque Meta. Même `event_id` que le pixel, pour que Meta
 * ne le compte qu'une fois. Les coordonnées partent hachées (SHA-256).
 */
export async function sendMetaPurchase(purchase: MetaPurchase): Promise<void> {
  const config = metaCapiConfig();
  if (!config) return;

  const phone = purchase.phone ? normalizePhone(purchase.phone) : null;
  const userData: Record<string, unknown> = {
    em: [sha256(purchase.email.trim().toLowerCase())],
    fn: [sha256(purchase.firstName.trim().toLowerCase())],
    ln: [sha256(purchase.lastName.trim().toLowerCase())],
    country: [sha256("ch")],
    ...(phone ? { ph: [sha256(phone)] } : {}),
    ...(purchase.ip ? { client_ip_address: purchase.ip } : {}),
    ...(purchase.userAgent ? { client_user_agent: purchase.userAgent } : {}),
    ...(purchase.fbp ? { fbp: purchase.fbp } : {}),
    ...(purchase.fbc ? { fbc: purchase.fbc } : {}),
  };

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: `purchase:${purchase.reference}`,
        action_source: "website",
        event_source_url: purchase.sourceUrl,
        user_data: userData,
        custom_data: {
          currency: purchase.currency,
          value: purchase.valueCents / 100,
          order_id: purchase.reference,
          content_type: "product",
          contents: purchase.items.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            item_price: i.priceCents / 100,
          })),
        },
      },
    ],
    ...(config.testCode ? { test_event_code: config.testCode } : {}),
  };

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${config.pixelId}/events?access_token=${encodeURIComponent(config.token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      console.error("[meta-capi] achat refusé", purchase.reference, res.status);
    }
  } catch (error) {
    console.error("[meta-capi] envoi impossible", purchase.reference, error instanceof Error ? error.name : "erreur");
  }
}
