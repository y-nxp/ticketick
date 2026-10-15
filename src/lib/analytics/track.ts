"use client";

import { matomoEvent, matomoOrder, matomoViewItem } from "./matomo";
import type { OrganizerTags } from "./organizer-tags";

/**
 * Événements de conversion, envoyés à Google (GA4, Google Ads) et à Meta,
 * ainsi qu'à Matomo (`matomo.ts`), qui mesure sans consentement.
 *
 * `gtag` existe dès que Google est configuré : sans accord, Consent Mode
 * n'envoie que des signaux sans cookie. `fbq` n'existe qu'après l'accord du
 * visiteur. Sans l'un ni l'autre, chaque appel est sans effet.
 *
 * Plusieurs organisateurs peuvent avoir leurs outils dans la même visite.
 * Un événement sans destinataire partirait vers tous les outils chargés :
 * chacun est donc adressé nommément (`send_to`, `trackSingle`), et un
 * organisateur ne reçoit que ses propres événements et billets.
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    /** Outils de ticketick, posés dans <head> par la mise en page. */
    __ttTags?: { google: string[]; meta: string | null };
  }
}

export interface TrackedItem {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
  organizer?: OrganizerTags;
}

type Params = Record<string, unknown>;

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

function siteTags() {
  return window.__ttTags ?? { google: [], meta: null };
}

const configuredGoogle = new Set<string>();
const initializedMeta = new Set<string>();

function organizerGoogle(id: string | undefined): string | null {
  if (!id || !window.gtag || siteTags().google.includes(id)) return null;
  if (!configuredGoogle.has(id)) {
    configuredGoogle.add(id);
    window.gtag("config", id, { send_page_view: false });
  }
  return id;
}

function organizerMeta(id: string | undefined): string | null {
  if (!id || !window.fbq || id === siteTags().meta) return null;
  if (!initializedMeta.has(id)) {
    initializedMeta.add(id);
    // Les événements automatiques partiraient sur toutes les pages visitées ensuite.
    window.fbq("set", "autoConfig", false, id);
    window.fbq("init", id);
  }
  return id;
}

function sendGoogle(name: string, params: Params, organizer?: OrganizerTags): void {
  if (!window.gtag) return;
  const site = siteTags().google;
  if (site.length > 0) window.gtag("event", name, { ...params, send_to: site });
  const org = organizerGoogle(organizer?.ga4Id);
  if (org) window.gtag("event", name, { ...params, send_to: org });
}

function sendMeta(name: string, params: Params, options?: Params, organizer?: OrganizerTags): void {
  if (!window.fbq) return;
  const site = siteTags().meta;
  if (site) window.fbq("trackSingle", site, name, params, options);
  const org = organizerMeta(organizer?.metaPixelId);
  if (org) window.fbq("trackSingle", org, name, params, options);
}

/** Articles regroupés par organisateur équipé d'au moins un outil. */
function byOrganizer(items: TrackedItem[]): { tags: OrganizerTags; items: TrackedItem[] }[] {
  const groups = new Map<string, { tags: OrganizerTags; items: TrackedItem[] }>();
  for (const item of items) {
    const tags = item.organizer;
    if (!tags?.metaPixelId && !tags?.ga4Id) continue;
    const key = `${tags.metaPixelId ?? ""}|${tags.ga4Id ?? ""}`;
    const group = groups.get(key) ?? { tags, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** Page vue côté Meta, pour ticketick seul (GA4 suit déjà les changements d'adresse). */
export function trackSitePageView(): void {
  const site = siteTags().meta;
  if (site) window.fbq?.("trackSingle", site, "PageView");
}

/** Page d'un organisateur : page vue pour ses propres outils. */
export function trackOrganizerPageView(organizer: OrganizerTags): void {
  const google = organizerGoogle(organizer.ga4Id);
  if (google) {
    window.gtag?.("event", "page_view", { page_location: window.location.href, send_to: google });
  }
  const meta = organizerMeta(organizer.metaPixelId);
  if (meta) window.fbq?.("trackSingle", meta, "PageView");
}

export function trackViewItem(event: { id: string; name: string }, organizer?: OrganizerTags): void {
  matomoViewItem(event);
  sendGoogle("view_item", { items: [{ item_id: event.id, item_name: event.name }] }, organizer);
  sendMeta(
    "ViewContent",
    { content_ids: [event.id], content_name: event.name, content_type: "product" },
    undefined,
    organizer,
  );
}

export function trackAddToCart(item: TrackedItem, currency: string): void {
  const value = amount(item.priceCents * item.quantity);
  sendGoogle("add_to_cart", { currency, value, items: gaItems([item]) }, item.organizer);
  sendMeta(
    "AddToCart",
    { currency, value, contents: metaContents([item]), content_type: "product" },
    undefined,
    item.organizer,
  );
}

function checkoutParams(items: TrackedItem[], currency: string) {
  const value = amount(total(items));
  return {
    google: { currency, value, items: gaItems(items) },
    meta: {
      currency,
      value,
      num_items: items.reduce((n, i) => n + i.quantity, 0),
      contents: metaContents(items),
      content_type: "product",
    },
  };
}

export function trackBeginCheckout(items: TrackedItem[], currency: string): void {
  const all = checkoutParams(items, currency);
  matomoEvent("Panier", "Passage en caisse");
  sendGoogle("begin_checkout", all.google);
  sendMeta("InitiateCheckout", all.meta);
  for (const group of byOrganizer(items)) {
    const own = checkoutParams(group.items, currency);
    const google = organizerGoogle(group.tags.ga4Id);
    if (google) window.gtag?.("event", "begin_checkout", { ...own.google, send_to: google });
    const meta = organizerMeta(group.tags.metaPixelId);
    if (meta) window.fbq?.("trackSingle", meta, "InitiateCheckout", own.meta);
  }
}

/** Même identifiant que l'envoi serveur (`meta-capi.ts`) : Meta ne compte l'achat qu'une fois. */
export function purchaseEventId(reference: string): string {
  return `purchase:${reference}`;
}

const PURCHASE_SENT_KEY = "ticketick.analytics.purchases";

function purchaseParams(
  order: { reference: string; currency: string; paymentType: string },
  items: TrackedItem[],
  valueCents: number,
) {
  const value = amount(valueCents);
  return {
    google: {
      transaction_id: order.reference,
      currency: order.currency,
      value,
      payment_type: order.paymentType,
      items: gaItems(items),
    },
    meta: {
      currency: order.currency,
      value,
      contents: metaContents(items),
      content_type: "product",
      order_id: order.reference,
    },
  };
}

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

  matomoOrder(order.reference, order.items, order.valueCents);
  const options = { eventID: purchaseEventId(order.reference) };
  const all = purchaseParams(order, order.items, order.valueCents);
  sendGoogle("purchase", all.google);
  sendMeta("Purchase", all.meta, options);

  // Chez l'organisateur : la valeur de ses billets, sans les frais ni les autres organisateurs.
  for (const group of byOrganizer(order.items)) {
    const own = purchaseParams(order, group.items, total(group.items));
    const google = organizerGoogle(group.tags.ga4Id);
    if (google) window.gtag?.("event", "purchase", { ...own.google, send_to: google });
    const meta = organizerMeta(group.tags.metaPixelId);
    if (meta) window.fbq?.("trackSingle", meta, "Purchase", own.meta, options);
  }

  try {
    localStorage.setItem(PURCHASE_SENT_KEY, JSON.stringify([...sent, order.reference].slice(-50)));
  } catch {
    // stockage indisponible : l'achat peut alors être compté deux fois
  }
}

/** Demande de rendez-vous d'un organisateur. */
export function trackOrganizerLead(): void {
  matomoEvent("Organisateurs", "Demande de rendez-vous");
  sendGoogle("generate_lead", { lead_source: "organizer_inquiry" });
  sendMeta("Lead", { content_name: "organizer_inquiry" });
}
