"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { failure, success, type FormState } from "@/lib/admin/form";
import { reachableAppOrigin } from "@/lib/app-url";
import { isCardProvider } from "@/lib/payment/card-account";
import { openSecret, sealSecret } from "@/lib/payment/secret-box";
import {
  createStripeWebhook,
  deleteStripeWebhook,
  parseStripeSecretKey,
  readStripeAccount,
  stripeWebhookIsLive,
} from "@/lib/payment/stripe-account";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  organizerId: z.string().min(1),
  secretKey: z.string().trim().max(300),
  enabled: z.boolean(),
});

/**
 * Enregistre le compte Stripe d'un organisateur et crée dans ce compte le
 * webhook qui prévient ticketick des paiements. Comme pour PayPal, la clé ne
 * repart jamais vers le navigateur : laissée vide, l'ancienne est conservée.
 */
export async function saveStripeAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    organizerId: formData.get("organizerId"),
    secretKey: formData.get("secretKey") ?? "",
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return failure("invalid");
  const data = parsed.data;

  const organizer = await prisma.organizer.findUnique({
    where: { id: data.organizerId },
    select: { id: true, stripe: true },
  });
  if (!organizer) return failure("notFound");
  const current = organizer.stripe;

  let previousKey: string | null = null;
  if (current) {
    try {
      previousKey = openSecret(current.secretEnc);
    } catch {
      previousKey = null;
    }
  }

  const secretKey = data.secretKey || previousKey;
  if (!secretKey) return failure("secretRequired");
  const mode = parseStripeSecretKey(secretKey);
  if (!mode) return failure("keyFormat");

  const keyChanged = secretKey !== previousKey;
  let accountId = current?.accountId ?? "";
  let accountName = current?.accountName ?? null;
  if (keyChanged || !current) {
    const account = await readStripeAccount(secretKey);
    if (!account) return failure("credentials");
    accountId = account.id;
    accountName = account.name;
  }

  let webhook =
    current?.webhookEndpointId && current.webhookSecretEnc
      ? { id: current.webhookEndpointId, secretEnc: current.webhookSecretEnc }
      : null;
  const origin = reachableAppOrigin();
  const url = origin ? `${origin}/api/webhooks/stripe/${organizer.id}` : null;
  if (url && (keyChanged || !webhook || !(await stripeWebhookIsLive(secretKey, webhook.id, url)))) {
    if (webhook) await deleteStripeWebhook(previousKey ?? secretKey, webhook.id);
    const created = await createStripeWebhook(secretKey, url);
    webhook = created ? { id: created.id, secretEnc: sealSecret(created.secret) } : null;
  }

  const fields = {
    accountId,
    accountName,
    secretEnc: sealSecret(secretKey),
    live: mode.live,
    webhookEndpointId: webhook?.id ?? null,
    webhookSecretEnc: webhook?.secretEnc ?? null,
    enabled: data.enabled,
  };
  await prisma.organizerStripeAccount.upsert({
    where: { organizerId: organizer.id },
    create: { organizerId: organizer.id, ...fields },
    update: fields,
  });

  revalidatePath("/admin/payments");
  return success(webhook ? "saved" : "savedNoWebhook");
}

const providerSchema = z.object({
  organizerId: z.string().min(1),
  cardProvider: z.string().refine(isCardProvider),
});

/** Prestataire qui encaisse la carte quand PostFinance et Stripe sont actifs. */
export async function saveCardProvider(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsed = providerSchema.safeParse({
    organizerId: formData.get("organizerId"),
    cardProvider: formData.get("cardProvider"),
  });
  if (!parsed.success) return failure("invalid");

  const updated = await prisma.organizer.updateMany({
    where: { id: parsed.data.organizerId },
    data: { cardProvider: parsed.data.cardProvider },
  });
  if (updated.count === 0) return failure("notFound");

  revalidatePath("/admin/payments");
  return success();
}
