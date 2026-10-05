import "server-only";

import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { openSecret } from "./secret-box";

/**
 * Compte Stripe de l'organisateur qui vend : le paiement arrive directement
 * chez lui, avec sa clé. Le Stripe de ticketick (`STRIPE_SECRET_KEY`) ne
 * sert qu'à facturer les organisateurs.
 */

export interface StripeAccount {
  organizerId: string;
  organizerName: string;
  accountId: string;
  secretKey: string;
  live: boolean;
  webhookSecret: string | null;
}

type Row = {
  organizerId: string;
  accountId: string;
  secretEnc: string;
  live: boolean;
  webhookSecretEnc: string | null;
  organizer: { name: string };
};

const select = {
  organizerId: true,
  accountId: true,
  secretEnc: true,
  live: true,
  webhookSecretEnc: true,
  organizer: { select: { name: true } },
} as const;

function toAccount(row: Row): StripeAccount | null {
  try {
    return {
      organizerId: row.organizerId,
      organizerName: row.organizer.name,
      accountId: row.accountId,
      secretKey: openSecret(row.secretEnc),
      live: row.live,
      webhookSecret: row.webhookSecretEnc ? openSecret(row.webhookSecretEnc) : null,
    };
  } catch (error) {
    // Clé de chiffrement changée : la clé Stripe est à ressaisir dans l'admin.
    console.error("[stripe] clé illisible pour", row.organizerId, error);
    return null;
  }
}

/** Compte actif de l'organisateur, sinon `null`. */
export async function stripeAccountForOrganizer(
  organizerId: string,
): Promise<StripeAccount | null> {
  const row = await prisma.organizerStripeAccount.findFirst({
    where: { organizerId, enabled: true },
    select,
  });
  return row ? toAccount(row) : null;
}

/**
 * Compte de l'organisateur, même désactivé depuis : un paiement fait doit
 * pouvoir être constaté et remboursé.
 */
export async function anyStripeAccountForOrganizer(
  organizerId: string,
): Promise<StripeAccount | null> {
  const row = await prisma.organizerStripeAccount.findUnique({
    where: { organizerId },
    select,
  });
  return row ? toAccount(row) : null;
}

const clients = new Map<string, Stripe>();

export function stripeClient(secretKey: string): Stripe {
  let client = clients.get(secretKey);
  if (!client) {
    client = new Stripe(secretKey);
    clients.set(secretKey, client);
  }
  return client;
}

/** `sk_live_…` / `rk_live_…` : production ; `…_test_…` : mode test. */
export function parseStripeSecretKey(key: string): { live: boolean } | null {
  const match = /^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.exec(key);
  return match ? { live: match[2] === "live" } : null;
}

/** Lit le compte rattaché à une clé, ou `null` si Stripe la refuse. */
export async function readStripeAccount(
  secretKey: string,
): Promise<{ id: string; name: string | null } | null> {
  try {
    const account = await stripeClient(secretKey).accounts.retrieveCurrent();
    const name =
      account.settings?.dashboard?.display_name ||
      account.business_profile?.name ||
      account.email ||
      null;
    return { id: account.id, name };
  } catch {
    return null;
  }
}

export const STRIPE_WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
];

/**
 * Crée dans le compte de l'organisateur le webhook qui prévient ticketick des
 * paiements. Échoue sur une adresse que Stripe ne peut pas joindre (poste de
 * développement) ou avec une clé restreinte sans ce droit.
 */
export async function createStripeWebhook(
  secretKey: string,
  url: string,
): Promise<{ id: string; secret: string } | null> {
  try {
    const endpoint = await stripeClient(secretKey).webhookEndpoints.create({
      url,
      enabled_events: STRIPE_WEBHOOK_EVENTS,
      description: "ticketick — billets payés",
      api_version: Stripe.API_VERSION as Stripe.WebhookEndpointCreateParams.ApiVersion,
    });
    return endpoint.secret ? { id: endpoint.id, secret: endpoint.secret } : null;
  } catch (error) {
    console.warn("[stripe] webhook non créé", url, error instanceof Error ? error.message : error);
    return null;
  }
}

/** Le webhook existe-t-il encore, actif et vers la bonne adresse ? */
export async function stripeWebhookIsLive(
  secretKey: string,
  endpointId: string,
  url: string,
): Promise<boolean> {
  try {
    const endpoint = await stripeClient(secretKey).webhookEndpoints.retrieve(endpointId);
    return endpoint.status === "enabled" && endpoint.url === url;
  } catch {
    return false;
  }
}

export async function deleteStripeWebhook(secretKey: string, endpointId: string): Promise<void> {
  try {
    await stripeClient(secretKey).webhookEndpoints.del(endpointId);
  } catch {
    // Déjà supprimé, ou ancienne clé révoquée : rien à faire.
  }
}
