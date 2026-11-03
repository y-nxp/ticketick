import assert from "node:assert/strict";
import { test } from "node:test";
import { optionBlocksForTicket } from "./option-block";

const SESSION = "s-bonmont";
const STARTS = new Date("2026-11-15T16:00:00Z");

function navette(summary: string) {
  return {
    title: "Je souhaite un service de navette par minibus (5 CHF par course)",
    summary,
    amountCents: 1000,
    unitPriceCents: 0,
    option: {
      sessionId: SESSION,
      title: { fr: "Je souhaite un service de navette par minibus (5 CHF par course)" },
      hint: null,
      ticketTitle: { fr: "Y compris service de navette par minibus (à payer directement au chauffeur)" },
      priceCents: 0,
      groups: [
        {
          title: { fr: "Aller Gare de Nyon → Abbaye de Bonmont (5 CHF)" },
          choices: [
            { label: { fr: "Dimanche 15 novembre à 15h30" } },
            { label: { fr: "Dimanche 15 novembre à 16h" } },
          ],
        },
        {
          title: { fr: "Retour Abbaye de Bonmont → gare de Nyon (5 CHF)" },
          choices: [
            { label: { fr: "Dimanche 15 novembre à 19h" } },
            { label: { fr: "Dimanche 15 novembre à 19h30" } },
          ],
        },
      ],
    },
  };
}

test("navette : l'heure de chaque course, avec ou sans minutes", () => {
  const [block] = optionBlocksForTicket(
    [navette("Dimanche 15 novembre à 15h30 · Dimanche 15 novembre à 19h")],
    SESSION,
    STARTS,
    "fr",
  );
  assert.deepEqual(block.trips, [
    "1 Aller : 15h30 Gare de Nyon -> Abbaye de Bonmont (5 CHF)",
    "1 Retour : 19h Abbaye de Bonmont -> gare de Nyon (5 CHF)",
  ]);
});

test("navette : aller à l'heure pile, retour avec minutes", () => {
  const [block] = optionBlocksForTicket(
    [navette("Dimanche 15 novembre à 16h · Dimanche 15 novembre à 19h30")],
    SESSION,
    STARTS,
    "fr",
  );
  assert.deepEqual(block.trips, [
    "1 Aller : 16h Gare de Nyon -> Abbaye de Bonmont (5 CHF)",
    "1 Retour : 19h30 Abbaye de Bonmont -> gare de Nyon (5 CHF)",
  ]);
});

test("navette d'une autre séance : absente du billet", () => {
  assert.deepEqual(
    optionBlocksForTicket([navette("Dimanche 15 novembre à 15h30")], "autre", STARTS, "fr"),
    [],
  );
});
