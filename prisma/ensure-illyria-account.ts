/**
 * Crée le compte organisateur Illyria et le rattache à Cantabile.
 *
 * Idempotent : relancé à chaque déploiement, il ne touche pas un mot de
 * passe déjà posé. Le premier accès se fait par « mot de passe oublié »
 * ou par impersonation administrateur.
 */

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

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
      "   Premier accès : impersonation admin, ou « mot de passe oublié » sur /login.",
    );
  }
}

main()
  .catch((error) => {
    console.error(`✖ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
