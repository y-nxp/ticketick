"use server";

import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { failure, success, type FormState } from "@/lib/admin/form";
import { formatIban, isValidIban } from "@/lib/iban";
import { checkPostfinanceCredentials } from "@/lib/payment/postfinance";
import { openSecret, sealSecret } from "@/lib/payment/secret-box";
import { prisma } from "@/lib/prisma";

const id = z.coerce.number().int().positive().max(2_147_483_647);

const postfinanceSchema = z.object({
  organizerId: z.string().min(1),
  spaceId: id,
  userId: id,
  secret: z.string().trim().max(200),
  spaceViewId: z.union([z.literal(""), id]),
  enabled: z.boolean(),
});

/**
 * Enregistre l'espace PostFinance Checkout d'un organisateur. Comme pour
 * PayPal, le secret ne repart jamais vers le navigateur : laissé vide,
 * l'ancien est conservé.
 */
export async function savePostfinanceAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsed = postfinanceSchema.safeParse({
    organizerId: formData.get("organizerId"),
    spaceId: formData.get("spaceId"),
    userId: formData.get("userId"),
    secret: formData.get("secret") ?? "",
    spaceViewId: String(formData.get("spaceViewId") ?? "").trim(),
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) return failure("invalid");
  const data = parsed.data;

  const organizer = await prisma.organizer.findUnique({
    where: { id: data.organizerId },
    select: { id: true, postfinance: true },
  });
  if (!organizer) return failure("notFound");

  let secret = data.secret;
  if (!secret) {
    if (!organizer.postfinance) return failure("secretRequired");
    try {
      secret = openSecret(organizer.postfinance.secretEnc);
    } catch {
      return failure("secretRequired");
    }
  }

  const credentialsChanged =
    !organizer.postfinance ||
    data.secret !== "" ||
    organizer.postfinance.spaceId !== data.spaceId ||
    organizer.postfinance.userId !== data.userId;
  if (
    credentialsChanged &&
    !(await checkPostfinanceCredentials({
      spaceId: data.spaceId,
      userId: data.userId,
      secret,
    }))
  ) {
    return failure("credentials");
  }

  const fields = {
    spaceId: data.spaceId,
    userId: data.userId,
    secretEnc: sealSecret(secret),
    spaceViewId: data.spaceViewId === "" ? null : data.spaceViewId,
    enabled: data.enabled,
  };
  await prisma.organizerPostfinanceAccount.upsert({
    where: { organizerId: organizer.id },
    create: { organizerId: organizer.id, ...fields },
    update: fields,
  });

  revalidatePath("/admin/payments");
  return success(organizer.id);
}

const bankSchema = z.object({
  organizerId: z.string().min(1),
  iban: z.string().trim().max(50),
  beneficiary: z.string().trim().max(140),
});

/** Compte qui reçoit les virements. Deux champs vides : plus de virement. */
export async function saveBankAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireAdmin();

  const parsed = bankSchema.safeParse({
    organizerId: formData.get("organizerId"),
    iban: formData.get("iban") ?? "",
    beneficiary: formData.get("beneficiary") ?? "",
  });
  if (!parsed.success) return failure("invalid");
  const { organizerId, iban, beneficiary } = parsed.data;

  const cleared = iban === "" && beneficiary === "";
  if (!cleared) {
    if (!isValidIban(iban)) return failure("iban");
    if (beneficiary.length < 2) return failure("beneficiary");
  }

  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { id: true },
  });
  if (!organizer) return failure("notFound");

  await prisma.organizer.update({
    where: { id: organizer.id },
    data: {
      bankIban: cleared ? null : formatIban(iban),
      bankBeneficiary: cleared ? null : beneficiary,
    },
  });

  revalidatePath("/admin/payments");
  return success(organizer.id);
}
