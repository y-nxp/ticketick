import assert from "node:assert/strict";
import { test } from "node:test";
import { tallySessionOptions, type OptionCatalog, type OptionOrderInput } from "./options-section";

const navette: OptionCatalog = {
  id: "opt-navette",
  title: { fr: "Navette minibus", en: "Minibus shuttle" },
  sortOrder: 0,
  groups: [
    {
      id: "aller",
      title: { fr: "Aller Gare de Nyon → Bonmont" },
      choices: [
        { id: "a1", label: { fr: "Dimanche à 15h30", en: "Sunday at 3:30 pm" } },
        { id: "a2", label: { fr: "Dimanche à 16h" } },
      ],
    },
    {
      id: "retour",
      title: { fr: "Retour Bonmont → gare de Nyon" },
      choices: [
        { id: "r1", label: { fr: "Dimanche à 19h" } },
        { id: "r2", label: { fr: "Dimanche à 19h30" } },
      ],
    },
  ],
};

function order(n: number, summary: string, people: number, sessionId = "s1"): OptionOrderInput {
  return {
    sessionId,
    option: navette,
    summary,
    people,
    order: { id: `o${n}`, reference: `R${n}`, name: `Client ${n}`, phone: null, email: `c${n}@x.ch` },
  };
}

test("compte commandes et personnes par horaire, dans l'ordre du catalogue", () => {
  const out = tallySessionOptions(
    [
      order(1, "Dimanche à 15h30 · Dimanche à 19h", 2),
      order(2, "Dimanche à 15h30", 3),
      order(3, "Dimanche à 16h · Dimanche à 19h30", 1),
    ],
    "fr",
  );
  const [report] = out.get("s1")!;
  assert.equal(report!.orders, 3);
  assert.equal(report!.people, 6);
  assert.deepEqual(
    report!.groups.map((g) => g.choices.map((c) => [c.label, c.orders, c.people])),
    [
      [["Dimanche à 15h30", 2, 5], ["Dimanche à 16h", 1, 1]],
      [["Dimanche à 19h", 1, 2], ["Dimanche à 19h30", 1, 1]],
    ],
  );
  assert.deepEqual(report!.buyers[1]!.choices, ["Dimanche à 15h30"]);
});

test("un résumé dans la langue de l'acheteur retrouve son choix", () => {
  const [report] = tallySessionOptions([order(1, "Sunday at 3:30 pm", 2)], "fr").get("s1")!;
  assert.equal(report!.groups[0]!.choices[0]!.people, 2);
  assert.deepEqual(report!.buyers[0]!.choices, ["Dimanche à 15h30"]);
  assert.deepEqual(report!.other, []);
});

test("un libellé disparu du catalogue est compté à part", () => {
  const [report] = tallySessionOptions(
    [order(1, "Samedi à 18h", 2), order(2, "samedi à 18h", 1)],
    "fr",
  ).get("s1")!;
  assert.deepEqual(report!.other, [{ label: "Samedi à 18h", orders: 2, people: 3 }]);
});

test("séances séparées ; commande sans billet valable ignorée", () => {
  const out = tallySessionOptions(
    [order(1, "Dimanche à 16h", 2, "s1"), order(2, "Dimanche à 16h", 4, "s2"), order(3, "Dimanche à 16h", 0, "s3")],
    "fr",
  );
  assert.equal(out.get("s1")![0]!.people, 2);
  assert.equal(out.get("s2")![0]!.people, 4);
  assert.equal(out.has("s3"), false);
});
