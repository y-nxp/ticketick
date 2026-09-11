/**
 * Création ou mise à jour du compte administrateur.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… npx tsx prisma/create-admin.ts
 *
 * Convergent : relancé sur un compte existant, il remplace le mot de passe et
 * rétablit le rôle. Le mot de passe n'est jamais affiché ni journalisé.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME?.trim() || "Administrateur";

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL et ADMIN_PASSWORD sont requis.\n" +
        "  Exemple : ADMIN_EMAIL=vous@ticketick.ch ADMIN_PASSWORD=… npx tsx prisma/create-admin.ts",
    );
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new Error(`Adresse invalide : ${email}`);
  }

  // Un compte administrateur ouvre l'accès à l'ensemble des données : le seuil
  // est volontairement plus élevé que pour un compte client.
  if (password.length < 12) {
    throw new Error(
      "Le mot de passe administrateur doit faire au moins 12 caractères.",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });

  const user = await prisma.user.upsert({
    where: { email },
    create: { email, name, passwordHash, role: "ADMIN", active: true },
    update: { passwordHash, role: "ADMIN", active: true },
    select: { id: true, email: true, role: true },
  });

  // Changer un mot de passe doit invalider les sessions déjà ouvertes, sans
  // quoi un accès obtenu avant le changement resterait valable.
  const { count } = await prisma.session.deleteMany({
    where: { userId: user.id },
  });

  console.log(
    existing
      ? `✅ Compte mis à jour : ${user.email} (${user.role})`
      : `✅ Compte créé : ${user.email} (${user.role})`,
  );
  if (count > 0) {
    console.log(`   ${count} session(s) ouverte(s) ont été fermées.`);
  }
}

main()
  .catch((error) => {
    console.error(`✖ ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
