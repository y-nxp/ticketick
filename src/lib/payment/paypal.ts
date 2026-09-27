import "server-only";

import { prisma } from "@/lib/prisma";
import { openSecret } from "./secret-box";

/**
 * PayPal Checkout (API Orders v2), encaissé sur le compte de l'organisateur.
 *
 * Parcours : création de l'ordre PayPal, approbation par l'acheteur chez
 * PayPal, puis capture à son retour. Tant que la capture n'a pas eu lieu,
 * aucun argent n'a bougé : un acheteur qui ferme la fenêtre ne paie rien et
 * sa rétention expire comme une autre.
 */

export interface PaypalAccount {
  organizerId: string;
  payeeEmail: string;
  clientId: string;
  secret: string;
  live: boolean;
}

export class PaypalError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly issue?: string,
  ) {
    super(message);
    this.name = "PaypalError";
  }
}

function base(account: { live: boolean }): string {
  return account.live
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

/** Compte actif de l'unique organisateur du panier, sinon `null`. */
export async function paypalAccountFor(
  organizerIds: string[],
): Promise<PaypalAccount | null> {
  const distinct = [...new Set(organizerIds)];
  if (distinct.length !== 1) return null;
  const row = await prisma.organizerPaypalAccount.findUnique({
    where: { organizerId: distinct[0] },
  });
  if (!row || !row.enabled) return null;
  return {
    organizerId: row.organizerId,
    payeeEmail: row.payeeEmail,
    clientId: row.clientId,
    secret: openSecret(row.secretEnc),
    live: row.live,
  };
}

const tokens = new Map<string, { value: string; until: number }>();

async function accessToken(account: {
  clientId: string;
  secret: string;
  live: boolean;
}): Promise<string> {
  const cacheKey = `${account.live ? "live" : "sandbox"}:${account.clientId}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.until > Date.now()) return cached.value;

  const res = await fetch(`${base(account)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${account.clientId}:${account.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new PaypalError(`authentification PayPal refusée (${res.status})`, res.status);
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  tokens.set(cacheKey, {
    value: body.access_token,
    // Marge d'une minute : un jeton qui expire pendant l'appel ferait échouer
    // un paiement pour rien.
    until: Date.now() + (body.expires_in - 60) * 1000,
  });
  return body.access_token;
}

/** Vérifie une paire Client ID / Secret avant de l'enregistrer. */
export async function checkPaypalCredentials(account: {
  clientId: string;
  secret: string;
  live: boolean;
}): Promise<boolean> {
  try {
    await accessToken(account);
    return true;
  } catch {
    return false;
  }
}

async function call<T>(
  account: PaypalAccount,
  path: string,
  init: { method: string; body?: unknown; requestId?: string },
): Promise<T> {
  const res = await fetch(`${base(account)}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${await accessToken(account)}`,
      "Content-Type": "application/json",
      ...(init.requestId ? { "PayPal-Request-Id": init.requestId } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue = json?.details?.[0]?.issue ?? json?.name;
    throw new PaypalError(
      `PayPal ${init.method} ${path} → ${res.status} ${issue ?? ""}`.trim(),
      res.status,
      issue,
    );
  }
  return json as T;
}

function toValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toCents(value: string): number {
  return Math.round(Number.parseFloat(value) * 100);
}

const PAYPAL_LOCALES: Record<string, string> = {
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT",
  en: "en-GB",
};

interface PaypalLink {
  href: string;
  rel: string;
}

export async function createPaypalOrder(
  account: PaypalAccount,
  input: {
    reference: string;
    amountCents: number;
    currency: string;
    description: string;
    brandName: string;
    locale: string;
    returnUrl: string;
    cancelUrl: string;
  },
): Promise<{ id: string; approveUrl: string }> {
  const order = await call<{ id: string; links: PaypalLink[] }>(
    account,
    "/v2/checkout/orders",
    {
      method: "POST",
      // Un même essai rejoué (double clic, reprise réseau) ne crée pas deux
      // ordres PayPal pour une même commande et un même montant.
      requestId: `${input.reference}-${input.amountCents}`,
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: input.reference,
            invoice_id: input.reference,
            custom_id: input.reference,
            description: input.description.slice(0, 127),
            amount: {
              currency_code: input.currency,
              value: toValue(input.amountCents),
            },
            payee: { email_address: account.payeeEmail },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: input.brandName.slice(0, 127) || "ticketick",
              locale: PAYPAL_LOCALES[input.locale] ?? "fr-FR",
              shipping_preference: "NO_SHIPPING",
              user_action: "PAY_NOW",
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      },
    },
  );
  const approve = order.links.find(
    (l) => l.rel === "payer-action" || l.rel === "approve",
  );
  if (!approve) throw new PaypalError("lien d'approbation PayPal absent");
  return { id: order.id, approveUrl: approve.href };
}

interface PaypalCapture {
  id: string;
  status: string;
  amount: { value: string; currency_code: string };
}

interface PaypalOrderBody {
  id: string;
  status: string;
  purchase_units?: { payments?: { captures?: PaypalCapture[] } }[];
}

function firstCapture(body: PaypalOrderBody): PaypalCapture | undefined {
  return body.purchase_units?.[0]?.payments?.captures?.[0];
}

export interface CaptureResult {
  completed: boolean;
  captureId?: string;
  amountCents?: number;
  currency?: string;
  issue?: string;
}

/** Capture un ordre approuvé. Rejouée, elle relit la capture existante. */
export async function capturePaypalOrder(
  account: PaypalAccount,
  paypalOrderId: string,
): Promise<CaptureResult> {
  let body: PaypalOrderBody;
  try {
    body = await call<PaypalOrderBody>(
      account,
      `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`,
      { method: "POST", body: {}, requestId: `capture-${paypalOrderId}` },
    );
  } catch (error) {
    if (error instanceof PaypalError && error.issue === "ORDER_ALREADY_CAPTURED") {
      body = await call<PaypalOrderBody>(
        account,
        `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}`,
        { method: "GET" },
      );
    } else if (error instanceof PaypalError && error.status === 422) {
      return { completed: false, issue: error.issue };
    } else {
      throw error;
    }
  }
  const capture = firstCapture(body);
  if (!capture || capture.status !== "COMPLETED") {
    return { completed: false, issue: capture?.status ?? body.status };
  }
  return {
    completed: true,
    captureId: capture.id,
    amountCents: toCents(capture.amount.value),
    currency: capture.amount.currency_code,
  };
}

/** Rembourse intégralement une capture. */
export async function refundPaypalCapture(
  account: PaypalAccount,
  captureId: string,
): Promise<{ id: string; status: string }> {
  return call<{ id: string; status: string }>(
    account,
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    { method: "POST", body: {}, requestId: `refund-${captureId}` },
  );
}
