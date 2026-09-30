/**
 * Crée le compte organisateur Illyria et le rattache à Cantabile.
 *
 * Idempotent : relancé à chaque déploiement, il ne touche pas un mot de
 * passe déjà posé. Le premier accès se fait par « mot de passe oublié ».
 *
 * L'espace PostFinance des variables PF_CHECKOUT_* est celui d'Illyria : il
 * devient son compte d'encaissement, une seule fois. Ce qui est ensuite
 * modifié dans l'admin (Encaissement) n'est plus jamais écrasé.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { sealSecret } from "../src/lib/payment/seal";

const prisma = new PrismaClient();

const EMAIL = (process.env.ILLYRIA_EMAIL ?? "illyria@illyria.ch")
  .trim()
  .toLowerCase();
const NAME = process.env.ILLYRIA_NAME?.trim() || "Illyria Communication";
const ORG_SLUG = process.env.ILLYRIA_ORG_SLUG?.trim() || "choeur-cantabile";

async function main() {
  const organizer = await prisma.organizer.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true, userId: true, producerName: true },
  });

  if (!organizer) {
    console.log(`  (pas d'organisateur ${ORG_SLUG} — rien à lier)`);
    return;
  }

  const existing = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, passwordHash: true, role: true },
  });

  const passwordHash =
    existing?.passwordHash ?? (await bcrypt.hash(randomBytes(24).toString("base64url"), 12));

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: {
      email: EMAIL,
      name: NAME,
      passwordHash,
      role: "ORGANIZER",
      active: true,
      locale: "fr",
    },
    update: {
      name: NAME,
      role: "ORGANIZER",
      active: true,
    },
    select: { id: true, email: true },
  });

  if (organizer.userId !== user.id) {
    await prisma.organizer.update({
      where: { id: organizer.id },
      data: { userId: user.id },
    });
  }

  console.log(`✅ Compte organisateur : ${user.email} → ${ORG_SLUG}`);
  if (!existing) {
    console.log(
      "   Premier accès : « mot de passe oublié » sur /login.",
    );
  }

  // Ne bloque jamais le déploiement : l'espace peut aussi se saisir à la main.
  await adoptPostfinanceFromEnv(organizer.id).catch((error) => {
    console.warn(
      `⚠ Espace PostFinance non repris : ${error instanceof Error ? error.message : error}`,
    );
  });
}

function positiveInt(value: string | undefined): number | null {
  const n = Number(value?.trim());
  return Number.isInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

async function adoptPostfinanceFromEnv(organizerId: string) {
  const spaceId = positiveInt(process.env.PF_CHECKOUT_SPACE_ID);
  const userId = positiveInt(
    process.env.PF_CHECKOUT_USER || process.env.PF_CHECKOUT_USER_ID,
  );
  const secret = process.env.PF_CHECKOUT_SECRET?.trim();
  if (!spaceId || !userId || !secret) return;

  const existing = await prisma.organizerPostfinanceAccount.findUnique({
    where: { organizerId },
    select: { id: true },
  });
  if (existing) return;

  await prisma.organizerPostfinanceAccount.create({
    data: {
      organizerId,
      spaceId,
      userId,
      secretEnc: sealSecret(secret),
      spaceViewId: positiveInt(process.env.PF_CHECKOUT_SPACE_VIEW_ID),
    },
  });
  console.log("✅ Espace PostFinance repris comme compte d'encaissement d'Illyria");
}

main()
  .catch((error) => {
    console.error(`✖ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
