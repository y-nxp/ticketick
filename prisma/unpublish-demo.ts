/**
 * Retire de la vente les spectacles du catalogue de démonstration.
 *
 * Ils passent en brouillon plutôt que d'être supprimés : des commandes et des
 * billets y sont rattachés, et une suppression serait irréversible. En
 * brouillon, ils disparaissent du site public — `getPublishedEvents` ne retient
 * que `PUBLISHED`, et l'accès direct par adresse écarte aussi les brouillons —
 * tout en restant visibles dans le backoffice.
 *
 * Les spectacles visés sont désignés par les identifiants du jeu de données de
 * démonstration, jamais « tous les spectacles » : rejoué plus tard, ce script
 * ne peut donc pas dépublier une programmation réelle.
 */
import { PrismaClient } from "@prisma/client";
import { events as demoEvents } from "./fixtures";

const prisma = new PrismaClient();

async function main() {
  const slugs = demoEvents.map((e) => e.slug);

  const concernes = await prisma.event.findMany({
    where: { slug: { in: slugs }, status: { not: "DRAFT" } },
    select: { slug: true, status: true },
  });

  if (concernes.length === 0) {
    console.log("Aucun spectacle de démonstration publié : rien à faire.");
    return;
  }

  for (const e of concernes) {
    console.log(`  ${e.slug} : ${e.status} → DRAFT`);
  }

  const { count } = await prisma.event.updateMany({
    where: { slug: { in: slugs } },
    data: { status: "DRAFT", featured: false },
  });

  const restant = await prisma.event.count({
    where: { status: "PUBLISHED", visibility: "PUBLIC" },
  });

  console.log(`\n${count} spectacle(s) mis en brouillon.`);
  console.log(`Spectacles encore publiés : ${restant}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
