import "server-only";

import { SignJWT } from "jose";

/**
 * PostFinance Checkout (API v2).
 *
 * Un même compte PF peut servir plusieurs projets. Chaque transaction porte
 * donc un libellé d'application (`PF_CHECKOUT_APP_NAME`, défaut `ticketick`)
 * dans `merchantReference`, `invoiceMerchantReference` et `metaData.app` :
 * c'est ce qui apparaît dans le back-office Checkout pour filtrer ticketick
 * des autres encaissements.
 *
 *   PF_CHECKOUT_SPACE_ID     — espace
 *   PF_CHECKOUT_USER         — id utilisateur d'application (alias : *_USER_ID)
 *   PF_CHECKOUT_SECRET       — clé d'authentification (base64)
 *   PF_CHECKOUT_APP_NAME     — nom visible côté Checkout (défaut : ticketick)
 *   PF_CHECKOUT_ENVIRONMENT  — LIVE | PREVIEW (facultatif)
 *   PF_CHECKOUT_SPACE_VIEW_ID — vue / page de paiement dédiée (facultatif)
 */

const API_PREFIX = "/api/v2.0";
const API_BASE = `https://checkout.postfinance.ch${API_PREFIX}`;

const PAID_STATES = new Set(["AUTHORIZED", "COMPLETED", "FULFILL"]);

export interface CheckoutLineItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface CreatePostfinanceInput {
  reference: string;
  currency: string;
  customerEmail: string;
  firstName: string;
  lastName: string;
  locale: string;
  successUrl: string;
  cancelUrl: string;
  lineItems: CheckoutLineItem[];
  feeCents?: number;
}

export interface CreatePostfinanceResult {
  provider: "postfinance";
  sessionId: string;
  checkoutUrl: string;
  mock: false;
  merchantReference: string;
}

export interface PostfinanceTransaction {
  id: number;
  state?: string;
  merchantReference?: string;
  currency?: string;
  authorizationAmount?: number;
  completedAmount?: number;
  customerEmailAddress?: string;
  metaData?: Record<string, string>;
}

export function postfinanceAppName(): string {
  const name = process.env.PF_CHECKOUT_APP_NAME?.trim();
  return name && name.length > 0 ? name : "ticketick";
}

export function merchantReferenceFor(orderReference: string): string {
  return `${postfinanceAppName()}:${orderReference}`;
}

export function orderReferenceFromMerchant(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const sep = value.lastIndexOf(":");
  if (sep >= 0) return value.slice(sep + 1) || undefined;
  return value;
}

export function isPostfinanceConfigured(): boolean {
  return Boolean(spaceId() && userId() && secret());
}

export function isPaidTransactionState(state: string | undefined): boolean {
  return Boolean(state && PAID_STATES.has(state));
}

export function amountToCents(amount: number | undefined): number | undefined {
  if (amount == null || Number.isNaN(amount)) return undefined;
  return Math.round(amount * 100);
}

export async function createPostfinanceCheckout(
  input: CreatePostfinanceInput,
): Promise<CreatePostfinanceResult> {
  const app = postfinanceAppName();
  const merchantReference = merchantReferenceFor(input.reference);
  const language = languageFor(input.locale);

  const lineItems = input.lineItems.map((item, index) => ({
    uniqueId: `${app}-item-${index + 1}`,
    sku: `${app}:${input.reference}:${index + 1}`,
    name: item.name,
    quantity: item.quantity,
    amountIncludingTax: francs(item.unitPriceCents * item.quantity),
    type: "PRODUCT",
  }));

  if (input.feeCents && input.feeCents > 0) {
    lineItems.push({
      uniqueId: `${app}-fee`,
      sku: `${app}:fee`,
      name: feeLabel(input.locale),
      quantity: 1,
      amountIncludingTax: francs(input.feeCents),
      type: "FEE",
    });
  }

  const transactionCreate: Record<string, unknown> = {
    currency: input.currency.toUpperCase(),
    language,
    customerEmailAddress: input.customerEmail,
    merchantReference,
    invoiceMerchantReference: merchantReference,
    successUrl: input.successUrl,
    failedUrl: input.cancelUrl,
    autoConfirmationEnabled: true,
    chargeRetryEnabled: true,
    customersPresence: "VIRTUAL_PRESENT",
    timeZone: "Europe/Zurich",
    billingAddress: {
      givenName: input.firstName,
      familyName: input.lastName,
      emailAddress: input.customerEmail,
      country: "CH",
    },
    metaData: {
      app,
      reference: input.reference,
    },
    lineItems,
  };

  const environment = process.env.PF_CHECKOUT_ENVIRONMENT?.trim().toUpperCase();
  if (environment === "LIVE" || environment === "PREVIEW") {
    transactionCreate.environment = environment;
  }

  const viewId = Number(process.env.PF_CHECKOUT_SPACE_VIEW_ID);
  if (Number.isInteger(viewId) && viewId > 0) {
    transactionCreate.spaceViewId = viewId;
  }

  const created = await pfFetch<PostfinanceTransaction>("/payment/transactions", {
    method: "POST",
    body: transactionCreate,
  });

  if (!created.id) {
    throw new Error("PostFinance : transaction créée sans identifiant.");
  }

  const checkoutUrl = await paymentPageUrl(created.id);
  return {
    provider: "postfinance",
    sessionId: String(created.id),
    checkoutUrl,
    mock: false,
    merchantReference,
  };
}

export async function fetchPostfinanceTransaction(
  transactionId: number,
): Promise<PostfinanceTransaction> {
  return pfFetch<PostfinanceTransaction>(
    `/payment/transactions/${encodeURIComponent(String(transactionId))}`,
    { method: "GET" },
  );
}

async function paymentPageUrl(transactionId: number): Promise<string> {
  const path = `/payment/transactions/${encodeURIComponent(String(transactionId))}/payment-page-url`;
  const raw = await pfFetch<unknown>(path, { method: "GET" });
  const url = extractUrl(raw);
  if (!url) {
    throw new Error("PostFinance : URL de paiement absente.");
  }
  return url;
}

function extractUrl(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.startsWith("http")) return raw.trim();
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["url", "paymentPageUrl", "value"]) {
      const hit = record[key];
      if (typeof hit === "string" && hit.startsWith("http")) return hit;
    }
  }
  return undefined;
}

async function pfFetch<T>(path: string, init: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Space: String(spaceId()),
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const token = await signRequest(path, init.method);
  headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${path}`, {
    method: init.method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `PostFinance ${init.method} ${path} → ${response.status} ${text.slice(0, 400)}`,
    );
  }

  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

async function signRequest(path: string, method: string): Promise<string> {
  const key = Buffer.from(secret(), "base64");
  return new SignJWT({
    requestPath: `${API_PREFIX}${path}`,
    requestMethod: method,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT", ver: 1 })
    .setSubject(String(userId()))
    .setIssuedAt()
    .sign(key);
}

function spaceId(): number | undefined {
  const raw = process.env.PF_CHECKOUT_SPACE_ID?.trim();
  if (!raw) return undefined;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function userId(): number | undefined {
  const raw =
    process.env.PF_CHECKOUT_USER?.trim() ||
    process.env.PF_CHECKOUT_USER_ID?.trim();
  if (!raw) return undefined;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function secret(): string {
  return process.env.PF_CHECKOUT_SECRET?.trim() ?? "";
}

function francs(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

function languageFor(locale: string): string {
  switch (locale) {
    case "de":
      return "de-CH";
    case "it":
      return "it-CH";
    case "en":
      return "en-US";
    default:
      return "fr-CH";
  }
}

function feeLabel(locale: string): string {
  switch (locale) {
    case "de":
      return "Servicegebühr";
    case "it":
      return "Costi di servizio";
    case "en":
      return "Service fee";
    default:
      return "Frais de service";
  }
}
