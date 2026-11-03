import { writeFile } from "node:fs/promises";
import { buildTicketsPdf } from "@/lib/tickets/pdf";
import { toTicketCard } from "@/lib/tickets/payload";

const locale = "fr";
const venue = {
  name: "Abbaye de Bonmont",
  address: "Route de Bonmont 31",
  zip: "1275",
  city: "Chéserex",
};
const startsAt = new Date("2026-11-15T16:00:00+01:00");
const doorsAt = new Date("2026-11-15T15:30:00+01:00");

const card = toTicketCard({
  code: "APERCU-DEMO-0001",
  eventTitle: { fr: "Beethoven — Messe en ut & Fantaisie chorale" },
  ticketName: { fr: "Plein tarif" },
  organizerName: "Chœur Cantabile",
  organizerSlug: "choeur-cantabile",
  organizerLogoUrl: "/partners/choeur-cantabile/logo.png",
  startsAt,
  doorsAt,
  venue,
  holderName: "Yann Durukan",
  reference: "APERCU-DEMO",
  priceCents: 3500,
  locale,
  optionBlocks: [
    {
      heading: "Y compris service de navette par minibus",
      date: "Dimanche 15 novembre 2026",
      trips: [
        "1 Aller : 15h30 Gare de Nyon -> Abbaye de Bonmont",
        "1 Retour : 19h30 Abbaye de Bonmont -> gare de Nyon",
      ],
      total: "Total : 10 CHF à payer directement au chauffeur",
    },
  ],
});

async function main() {
  const pdf = await buildTicketsPdf([card], locale);
  const out = "/tmp/ticketick-billet-apercu.pdf";
  await writeFile(out, pdf);
  console.log(out);
}

void main();
