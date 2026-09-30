"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { failure, success, type FormState } from "@/lib/admin/form";
import { checkPaypalCredentials } from "@/lib/payment/paypal";
import { openSecret, sealSecret } from "@/lib/payment/secret-box";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  organizerId: z.string().min(1),
  payeeEmail: z.email().max(200),
  clientId: z.string().trim().min(10).max(200),
  secret: z.string().trim().max(200),
  live: z.boolean(),
  enabled: z.boolean(),
});

/**
 * Enregistre le compte PayPal d'un organisateur. Le secret n'est jamais
 * renvoyé au navigateur : laissé vide, l'ancien est conservé.
 */
export async function savePaypalAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsed = schema.safeParse({
    organizerId: formData.get("organizerId"),
    payeeEmail: String(formData.get("payeeEmail") ?? "").trim().toLowerCase(),
    clientId: formData.get("clientId"),
    secret: formData.get("secret") ?? "",
    live: formData.get("live") === "on",
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return failure("invalid");
  const data = parsed.data;

  const organizer = await prisma.organizer.findUnique({
    where: { id: data.organizerId },
    select: { id: true, paypal: true },
  });
  if (!organizer) return failure("notFound");

  let secret = data.secret;
  if (!secret) {
    if (!organizer.paypal) return failure("secretRequired");
    try {
      secret = openSecret(organizer.paypal.secretEnc);
    } catch {
      return failure("secretRequired");
    }
  }

  const credentialsChanged =
    !organizer.paypal ||
    data.secret !== "" ||
    organizer.paypal.clientId !== data.clientId ||
    organizer.paypal.live !== data.live;
  if (
    credentialsChanged &&
    !(await checkPaypalCredentials({ clientId: data.clientId, secret, live: data.live }))
  ) {
    return failure("credentials");
  }

  const fields = {
    payeeEmail: data.payeeEmail,
    clientId: data.clientId,
    secretEnc: sealSecret(secret),
    live: data.live,
    enabled: data.enabled,
  };
  await prisma.organizerPaypalAccount.upsert({
    where: { organizerId: organizer.id },
    create: { organizerId: organizer.id, ...fields },
    update: fields,
  });

  revalidatePath("/admin/payments");
  return success(organizer.id);
}
