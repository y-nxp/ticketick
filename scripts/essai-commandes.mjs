/**
 * Épreuve du tunnel de commande, contre le serveur de développement.
 *
 *   node scripts/essai-commandes.mjs
 *
 * Vérifie ce qu'un contrôle de type ne peut pas prouver : que le prix vient
 * bien de la base, et que deux acheteurs simultanés ne peuvent pas se
 * partager une place qui n'existe qu'en un exemplaire.
 */

import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();

let echecs = 0;
function verifier(intitule, condition, detail = "") {
  console.log(`  ${condition ? "✅" : "✖ "} ${intitule}${detail ? ` — ${detail}` : ""}`);
  if (!condition) echecs++;
}

async function commander(lines, extra = {}) {
  const reponse = await fetch(`${BASE}/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Jeanne",
      lastName: "Essai",
      email: "jeanne@example.ch",
      locale: "fr",
      paymentMethod: "CARD",
      lines,
      ...extra,
    }),
  });
  return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
}

// Prisma ne sait pas comparer deux colonnes dans un `where` : le stock
// restant se filtre donc après lecture.
const candidats = await prisma.ticketType.findMany({
  where: { session: { startsAt: { gt: new Date() }, status: "PUBLISHED" } },
  select: { id: true, priceCents: true, quantity: true, sold: true, maxPerOrder: true },
});
const tt = candidats.find((c) => c.quantity - c.sold >= 60 && c.maxPerOrder >= 2);
if (!tt) throw new Error("Aucun tarif disposant d'assez de stock pour l'essai.");

console.log(`\nTarif retenu : ${tt.priceCents / 100} CHF, ${tt.sold}/${tt.quantity} vendus\n`);

// ── 1. Commande normale ────────────────────────────────────────────────────
console.log("1. Commande ordinaire");
const avant = tt.sold;
const { statut, corps } = await commander([{ ticketTypeId: tt.id, quantity: 2 }]);
verifier("acceptée", statut === 200, `HTTP ${statut}`);

const enregistree = corps?.reference
  ? await prisma.order.findUnique({
      where: { reference: corps.reference },
      select: { totalCents: true, subtotalCents: true, status: true, items: true },
    })
  : null;
verifier("enregistrée en base", !!enregistree, corps?.reference ?? "aucune référence");
verifier(
  "montant calculé côté serveur",
  enregistree?.subtotalCents === tt.priceCents * 2,
  `${enregistree?.subtotalCents} attendu ${tt.priceCents * 2}`,
);

const apres = await prisma.ticketType.findUnique({
  where: { id: tt.id },
  select: { sold: true },
});
verifier("stock décompté", apres.sold === avant + 2, `${avant} → ${apres.sold}`);

// ── 2. Prix imposé par le client ───────────────────────────────────────────
console.log("\n2. Tentative d'imposer son prix");
const triche = await commander([
  { ticketTypeId: tt.id, quantity: 1, unitPriceCents: 1, priceCents: 1 },
]);
const ordreTriche = triche.corps?.reference
  ? await prisma.order.findUnique({
      where: { reference: triche.corps.reference },
      select: { subtotalCents: true },
    })
  : null;
verifier(
  "le prix envoyé est ignoré",
  ordreTriche?.subtotalCents === tt.priceCents,
  `facturé ${ordreTriche?.subtotalCents}, tentative à 1`,
);

// ── 3. Au-delà du stock ────────────────────────────────────────────────────
console.log("\n3. Demande supérieure au stock");
// Un tarif dédié, au stock volontairement bas, pour éprouver la borne de
// stock elle-même et non le plafond par commande.
const rareStock = await prisma.ticketType.create({
  data: {
    sessionId: (await prisma.ticketType.findUnique({
      where: { id: tt.id }, select: { sessionId: true },
    })).sessionId,
    name: { fr: "Stock réduit (essai)", en: "", de: "", it: "" },
    priceCents: 4000,
    quantity: 3,
    maxPerOrder: 10,
  },
  select: { id: true },
});
const trop = await commander([{ ticketTypeId: rareStock.id, quantity: 5 }]);
verifier(
  "refusée pour stock insuffisant",
  trop.statut === 409 && trop.corps?.error === "sold_out",
  `HTTP ${trop.statut} ${trop.corps?.error ?? ""}`,
);
const intact = await prisma.ticketType.findUnique({
  where: { id: rareStock.id }, select: { sold: true },
});
verifier("aucune place retenue par le refus", intact.sold === 0, `sold = ${intact.sold}`);

// ── 4. Concurrence sur la dernière place ───────────────────────────────────
console.log("\n4. Deux acheteurs sur la dernière place");
const rare = await prisma.ticketType.create({
  data: {
    sessionId: (await prisma.ticketType.findUnique({
      where: { id: tt.id }, select: { sessionId: true },
    })).sessionId,
    name: { fr: "Place unique (essai)", en: "", de: "", it: "" },
    priceCents: 5000,
    quantity: 1,
    maxPerOrder: 5,
  },
  select: { id: true },
});

const simultanees = await Promise.all(
  Array.from({ length: 8 }, () => commander([{ ticketTypeId: rare.id, quantity: 1 }])),
);
const acceptees = simultanees.filter((r) => r.statut === 200).length;
const vendu = (await prisma.ticketType.findUnique({
  where: { id: rare.id }, select: { sold: true },
})).sold;

verifier("une seule commande acceptée", acceptees === 1, `${acceptees} acceptée(s) sur 8`);
verifier("stock jamais dépassé", vendu === 1, `sold = ${vendu} pour 1 place`);

// ── 5. Séance passée ───────────────────────────────────────────────────────
console.log("\n5. Séance déjà jouée");
const passee = await prisma.ticketType.findFirst({
  where: { session: { startsAt: { lt: new Date() } } },
  select: { id: true },
});
if (passee) {
  const r = await commander([{ ticketTypeId: passee.id, quantity: 1 }]);
  verifier("refusée", r.statut === 409, `HTTP ${r.statut} ${r.corps?.error ?? ""}`);
} else {
  console.log("  — aucune séance passée dans le jeu de démonstration");
}

// ── Nettoyage ──────────────────────────────────────────────────────────────
for (const id of [rare.id, rareStock.id]) {
  await prisma.orderItem.deleteMany({ where: { ticketTypeId: id } });
  await prisma.ticket.deleteMany({ where: { ticketTypeId: id } });
  await prisma.ticketType.delete({ where: { id } });
}

console.log(`\n${echecs === 0 ? "✅ Tout est conforme." : `✖ ${echecs} contrôle(s) en échec.`}\n`);
await prisma.$disconnect();
process.exit(echecs === 0 ? 0 : 1);
