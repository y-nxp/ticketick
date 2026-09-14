import "server-only";

import { SignJWT } from "jose";

/**
 * PostFinance Checkout de l'organisateur (API v2).
 *
 * L'acheteur paie le spectacle : l'argent arrive sur le compte PF du client
 * (Chœur Cantabile, etc.). ticketick n'y prélève rien. Stripe, lui, sert
 * plus tard à facturer l'organisateur, pas à encaisser les billets.
 *
 * Un même espace PF peut porter plusieurs spectacles. La référence marchande
 * est `{slug}:{commande}` (ex. beethoven-cantabile-2026:TT-ABCD-EFGH) pour
 * les distinguer dans le back-office Checkout.
 *
 *   PF_CHECKOUT_SPACE_ID / USER / SECRET — accès de l'organisateur
 *   PF_CHECKOUT_ENVIRONMENT              — LIVE | PREVIEW (facultatif)
 *   PF_CHECKOUT_SPACE_VIEW_ID            — page de paiement dédiée (facultatif)
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
  /** Slug du spectacle, visible dans Checkout à côté de la commande. */
  project: string;
  organizerName?: string;
  /** Identifiant ticketick du spectateur connecté : permet le one-click PF. */
  customerId?: string;
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

export function projectLabel(project?: string): string {
  const fromOrder = project?.trim();
  if (fromOrder) return fromOrder;
  const fromEnv = process.env.PF_CHECKOUT_APP_NAME?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : "ticketick";
}

export function merchantReferenceFor(
  orderReference: string,
  project?: string,
): string {
  return `${projectLabel(project)}:${orderReference}`;
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
  const project = projectLabel(input.project);
  const merchantReference = merchantReferenceFor(input.reference, project);
  const language = languageFor(input.locale);

  const lineItems = input.lineItems.map((item, index) => ({
    uniqueId: lineToken(project, `item-${index + 1}`),
    sku: lineToken(project, `${input.reference}-${index + 1}`),
    name: item.name.slice(0, 150),
    quantity: item.quantity,
    amountIncludingTax: francs(item.unitPriceCents * item.quantity),
    type: "PRODUCT",
  }));

  if (input.feeCents && input.feeCents > 0) {
    lineItems.push({
      uniqueId: lineToken(project, "fee"),
      sku: lineToken(project, "fee"),
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
      integrator: "ticketick",
      event: project,
      reference: input.reference,
      ...(input.organizerName ? { organizer: input.organizerName } : {}),
    },
    lineItems,
  };

  if (input.customerId) {
    transactionCreate.customerId = input.customerId;
    transactionCreate.tokenizationMode = "ALLOW_ONE_CLICK_PAYMENT";
  }

  // Ne pas forcer LIVE : un espace encore en test refuse alors la création.
  // Sans ce champ, PostFinance prend le mode de l'espace.

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

export interface SavedCard {
  id: number;
  label: string;
}

export async function listSavedCards(customerId: string): Promise<SavedCard[]> {
  if (!isPostfinanceConfigured()) return [];
  const raw = await pfFetch<unknown>("/payment/tokens/search", {
    method: "GET",
    query: {
      query: `customerId:${customerId} AND enabledForOneClickPayment:true`,
      limit: "20",
    },
  });
  const rows = asList(raw);
  return rows
    .filter((row) => row.state === "ACTIVE" || !row.state)
    .map((row) => ({
      id: Number(row.id),
      label: typeof row.name === "string" && row.name.trim() ? row.name : "••••",
    }))
    .filter((card) => Number.isInteger(card.id) && card.id > 0);
}

export async function deleteSavedCard(
  customerId: string,
  tokenId: number,
): Promise<void> {
  const cards = await listSavedCards(customerId);
  if (!cards.some((card) => card.id === tokenId)) {
    throw new Error("Carte inconnue pour ce compte.");
  }
  await pfFetch(`/payment/tokens/${encodeURIComponent(String(tokenId))}`, {
    method: "DELETE",
  });
}

async function paymentPageUrl(transactionId: number): Promise<string> {
  const path = `/payment/transactions/${encodeURIComponent(String(transactionId))}/payment-page-url`;
  // Cet endpoint renvoie une URL en texte : Accept: application/json → 406.
  const raw = await pfFetch<unknown>(path, {
    method: "GET",
    accept: "text/plain",
  });
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

async function pfFetch<T>(
  path: string,
  init: {
    method: "GET" | "POST" | "DELETE";
    body?: unknown;
    accept?: string;
    query?: Record<string, string>;
  },
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: init.accept ?? "application/json",
    Space: String(spaceId()),
  };
  if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const search = init.query ? new URLSearchParams(init.query).toString() : "";
  const signedPath = search ? `${path}?${search}` : path;

  const token = await signRequest(signedPath, init.method);
  headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${signedPath}`, {
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

/** uniqueId / sku : lettres, chiffres, point, underscore, tiret uniquement. */
function asList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter(isRecord);
  if (raw && typeof raw === "object") {
    const record = raw as Record<string, unknown>;
    for (const key of ["data", "result", "items"]) {
      if (Array.isArray(record[key])) {
        return (record[key] as unknown[]).filter(isRecord);
      }
    }
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function lineToken(project: string, suffix: string): string {
  const raw = `${project}-${suffix}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
  return raw.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 200);
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
