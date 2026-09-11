/**
 * Vérifie qu'un encaissement non configuré refuse la vente au lieu de
 * distribuer des billets gratuits, et qu'il rend les places retenues.
 *
 * À lancer deux fois : sans ALLOW_MOCK_PAYMENTS (refus attendu), puis avec
 * (vente simulée attendue). Le comportement voulu dépend de l'environnement,
 * c'est donc l'appelant qui dit lequel il attend.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.BASE ?? "http://localhost:3000";
const attendu = process.argv[2] === "simule" ? "simule" : "refus";

function ligne(ok, texte) {
  console.log(`  ${ok ? "✓" : "✗"} ${texte}`);
  if (!ok) process.exitCode = 1;
}

const evenement = await prisma.event.findFirst({
  where: { sessions: { some: { ticketTypes: { some: {} } } } },
  include: { sessions: { include: { ticketTypes: true } } },
});

if (!evenement) {
  console.error("Aucun événement avec tarif en base.");
  process.exit(1);
}

// Prisma ne sait pas comparer deux colonnes dans un `where` : le tri se fait
// donc côté script.
const tarif = evenement.sessions
  .flatMap((s) => s.ticketTypes)
  .find((t) => t.quantity - t.sold >= 2);

if (!tarif) {
  console.error("Aucun tarif avec deux places libres.");
  process.exit(1);
}

const etatInitial = await prisma.event.findUnique({
  where: { id: evenement.id },
  select: { status: true },
});

await prisma.event.update({
  where: { id: evenement.id },
  data: { status: "PUBLISHED" },
});

const avant = await prisma.ticketType.findUnique({
  where: { id: tarif.id },
  select: { sold: true },
});

const payeesAvant = await prisma.order.count({ where: { status: "PAID" } });

async function acheter(methode) {
  const res = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Essai",
      lastName: "Paiement",
      email: "essai-paiement@example.ch",
      locale: "fr",
      paymentMethod: methode,
      lines: [{ ticketTypeId: tarif.id, quantity: 2 }],
    }),
  });
  return { status: res.status, corps: await res.json().catch(() => null) };
}

// Les libellés sont stockés traduits : `name` est un objet, pas une chaîne.
const libelle = tarif.name?.fr ?? tarif.name?.en ?? tarif.id;
console.log(`\nTarif « ${libelle} » — vendus avant : ${avant.sold}\n`);

const carte = await acheter("CARD");
const virement = await acheter("IBAN");

const apres = await prisma.ticketType.findUnique({
  where: { id: tarif.id },
  select: { sold: true },
});
const payees = await prisma.order.count({ where: { status: "PAID" } });

if (attendu === "refus") {
  ligne(carte.status === 503, `carte refusée (HTTP ${carte.status}, attendu 503)`);
  ligne(
    carte.corps?.error === "payment_unavailable",
    `motif explicite : ${carte.corps?.error}`,
  );
  ligne(
    virement.status === 503,
    `virement refusé (HTTP ${virement.status}, attendu 503)`,
  );
  ligne(
    apres.sold === avant.sold,
    `stock rendu : ${avant.sold} → ${apres.sold} (aucune place perdue)`,
  );
  // Les commandes refusées subsistent en CANCELLED : c'est la trace comptable
  // de la tentative. Ce qu'il faut vérifier, c'est qu'aucune n'a été soldée.
  ligne(payees === payeesAvant, `aucune commande soldée : ${payees} inchangé`);
  const nouvelles = await prisma.order.findMany({
    where: { email: "essai-paiement@example.ch" },
    select: { status: true },
  });
  ligne(
    nouvelles.every((o) => o.status === "CANCELLED"),
    `tentatives annulées et non payées (${nouvelles.length} en CANCELLED)`,
  );
} else {
  ligne(carte.status === 200, `carte acceptée (HTTP ${carte.status})`);
  ligne(carte.corps?.status === "PAID", `commande soldée : ${carte.corps?.status}`);
  ligne(
    virement.status === 200,
    `virement accepté (HTTP ${virement.status})`,
  );
  ligne(
    typeof virement.corps?.iban === "string",
    `IBAN transmis : ${virement.corps?.iban}`,
  );
  ligne(apres.sold === avant.sold + 4, `stock retenu : ${avant.sold} → ${apres.sold}`);
  console.log(`  · commandes payées en base : ${payees}`);
}

await prisma.event.update({
  where: { id: evenement.id },
  data: { status: etatInitial.status },
});
console.log(`\nÉvénement remis en ${etatInitial.status}.`);

await prisma.$disconnect();
