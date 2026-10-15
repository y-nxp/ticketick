"use client";

/**
 * Mesure d'audience Matomo (stats.nextalp.com, hébergé en Suisse), sans
 * cookie ni consentement : elle part pour tous les visiteurs. `_paq` n'existe
 * que si Matomo est configuré ; sinon chaque appel est sans effet.
 *
 * Aucune donnée personnelle : produits, montants et référence de commande.
 */

declare global {
  interface Window {
    _paq?: unknown[][];
  }
}

export interface MatomoItem {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
}

function paq(...command: unknown[]): void {
  window._paq?.push(command);
}

const amount = (cents: number) => Math.round(cents) / 100;

function addItems(items: MatomoItem[]): number {
  paq("clearEcommerceCart");
  let totalCents = 0;
  for (const item of items) {
    paq("addEcommerceItem", item.id, item.name, undefined, amount(item.priceCents), item.quantity);
    totalCents += item.priceCents * item.quantity;
  }
  return totalCents;
}

let previousUrl: string | null = null;

export function matomoPageView(): void {
  if (previousUrl) paq("setReferrerUrl", previousUrl);
  paq("setCustomUrl", window.location.href);
  paq("setDocumentTitle", document.title);
  paq("trackPageView");
  previousUrl = window.location.href;
}

/** À appeler avant la page vue de la fiche, qui porte alors le produit. */
export function matomoViewItem(event: { id: string; name: string }): void {
  paq("setEcommerceView", event.id, event.name);
}

/** Contenu complet du panier : Matomo en déduit les paniers abandonnés. */
export function matomoCartUpdate(items: MatomoItem[]): void {
  paq("trackEcommerceCartUpdate", amount(addItems(items)));
}

export function matomoOrder(reference: string, items: MatomoItem[], valueCents: number): void {
  addItems(items);
  paq("trackEcommerceOrder", reference, amount(valueCents));
}

export function matomoEvent(category: string, action: string): void {
  paq("trackEvent", category, action);
}
