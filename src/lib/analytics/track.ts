"use client";

/**
 * Événements de conversion, envoyés à Google (GA4, Google Ads) et à Meta.
 *
 * `gtag` existe dès que Google est configuré : sans accord, Consent Mode
 * n'envoie que des signaux sans cookie. `fbq` n'existe qu'après l'accord du
 * visiteur. Sans l'un ni l'autre, chaque appel est sans effet.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export interface TrackedItem {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
}

const amount = (cents: number) => Math.round(cents) / 100;

function gaItems(items: TrackedItem[]) {
  return items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    price: amount(i.priceCents),
    quantity: i.quantity,
  }));
}

function metaContents(items: TrackedItem[]) {
  return items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: amount(i.priceCents) }));
}

function total(items: TrackedItem[]): number {
  return items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);
}

export function trackViewItem(event: { id: string; name: string }): void {
  window.gtag?.("event", "view_item", {
    items: [{ item_id: event.id, item_name: event.name }],
  });
  window.fbq?.("track", "ViewContent", {
    content_ids: [event.id],
    content_name: event.name,
    content_type: "product",
  });
}

export function trackAddToCart(item: TrackedItem, currency: string): void {
  const value = amount(item.priceCents * item.quantity);
  window.gtag?.("event", "add_to_cart", { currency, value, items: gaItems([item]) });
  window.fbq?.("track", "AddToCart", {
    currency,
    value,
    contents: metaContents([item]),
    content_type: "product",
  });
}

export function trackBeginCheckout(items: TrackedItem[], currency: string): void {
  const value = amount(total(items));
  window.gtag?.("event", "begin_checkout", { currency, value, items: gaItems(items) });
  window.fbq?.("track", "InitiateCheckout", {
    currency,
    value,
    num_items: items.reduce((n, i) => n + i.quantity, 0),
    contents: metaContents(items),
    content_type: "product",
  });
}

/** Même identifiant que l'envoi serveur (`meta-capi.ts`) : Meta ne compte l'achat qu'une fois. */
export function purchaseEventId(reference: string): string {
  return `purchase:${reference}`;
}

const PURCHASE_SENT_KEY = "ticketick.analytics.purchases";

/** Une seule fois par commande et par navigateur, même si la page est rechargée. */
export function trackPurchase(order: {
  reference: string;
  valueCents: number;
  currency: string;
  items: TrackedItem[];
  paymentType: string;
}): void {
  let sent: string[] = [];
  try {
    sent = JSON.parse(localStorage.getItem(PURCHASE_SENT_KEY) ?? "[]");
  } catch {
    sent = [];
  }
  if (sent.includes(order.reference)) return;

  const value = amount(order.valueCents);
  window.gtag?.("event", "purchase", {
    transaction_id: order.reference,
    currency: order.currency,
    value,
    payment_type: order.paymentType,
    items: gaItems(order.items),
  });
  window.fbq?.(
    "track",
    "Purchase",
    {
      currency: order.currency,
      value,
      contents: metaContents(order.items),
      content_type: "product",
      order_id: order.reference,
    },
    { eventID: purchaseEventId(order.reference) },
  );

  try {
    localStorage.setItem(PURCHASE_SENT_KEY, JSON.stringify([...sent, order.reference].slice(-50)));
  } catch {
    // stockage indisponible : l'achat peut alors être compté deux fois
  }
}

/** Demande de rendez-vous d'un organisateur. */
export function trackOrganizerLead(): void {
  window.gtag?.("event", "generate_lead", { lead_source: "organizer_inquiry" });
  window.fbq?.("track", "Lead", { content_name: "organizer_inquiry" });
}
