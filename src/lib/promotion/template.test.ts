import assert from "node:assert/strict";
import { test } from "node:test";
import { campaignLink, displayLink } from "./channels";
import {
  formatAmount,
  formatSessionDate,
  hashtag,
  hashtags,
  promotionBody,
  promotionMessage,
  PROMOTION_LOCALES,
  type TemplateInput,
} from "./template";

const NBSP = " ";
const venue = { name: "Église", city: "Rougemont" };
const base: Omit<TemplateInput, "locale"> = {
  title: "Requiem",
  subtitle: "Les voix du Sud",
  // 19:00 UTC en novembre : 20:00 à Zurich (heure d'hiver).
  sessions: [{ startsAt: "2026-11-14T19:00:00Z", venue }],
  priceCents: 3500,
  tags: ["Grands duos", "Bel canto"],
};

test("gabarit dans les quatre langues : titre, date à Zurich, lieu, prix, mots-clics", () => {
  const expected = {
    fr: ["📅 samedi 14 novembre à 20:00", `🎟️ Billets dès 35${NBSP}CHF`],
    de: ["📅 Samstag, 14. November, 20:00 Uhr", `🎟️ Tickets ab CHF${NBSP}35`],
    en: ["📅 Saturday 14 November, 20:00", `🎟️ Tickets from CHF${NBSP}35`],
    it: ["📅 sabato 14 novembre, ore 20:00", `🎟️ Biglietti da CHF${NBSP}35`],
  };
  for (const locale of PROMOTION_LOCALES) {
    const [date, price] = expected[locale];
    assert.equal(
      promotionBody({ ...base, locale }),
      ["Requiem", "Les voix du Sud", "", date, "📍 Église, Rougemont", price, "", "#GrandsDuos #BelCanto"].join("\n"),
      locale,
    );
  }
});

test("dates à Zurich : heure d'été, passage de minuit", () => {
  // 18:30 UTC en juin : 20:30 à Zurich (heure d'été).
  assert.equal(formatSessionDate("2027-06-05T18:30:00Z", "fr"), "samedi 5 juin à 20:30");
  // 23:30 UTC le 31 décembre : déjà le 1er janvier à Zurich.
  assert.equal(formatSessionDate("2026-12-31T23:30:00Z", "fr"), "vendredi 1 janvier à 00:30");
  assert.equal(formatSessionDate("2026-12-31T23:30:00Z", "de"), "Freitag, 1. Januar, 00:30 Uhr");
  assert.equal(formatSessionDate(new Date("2026-12-31T23:30:00Z"), "en"), "Friday 1 January, 00:30");
  assert.equal(formatSessionDate("2026-12-31T23:30:00Z", "it"), "venerdì 1 gennaio, ore 00:30");
});

test("gratuit : aucune mention de prix, dans aucune langue", () => {
  for (const locale of PROMOTION_LOCALES) {
    const body = promotionBody({ ...base, locale, priceCents: 0 });
    assert.doesNotMatch(body, /CHF|🎟️/, locale);
  }
});

test("prix en notation suisse, centimes seulement s'il y en a", () => {
  assert.equal(formatAmount(3500), "35");
  assert.equal(formatAmount(3550), "35.50");
  assert.equal(formatAmount(1205), "12.05");
  assert.match(promotionBody({ ...base, locale: "fr", priceCents: 2990 }), /dès 29\.90/);
});

test("sans sous-titre ni étiquettes : pas de ligne vide superflue", () => {
  const body = promotionBody({ ...base, locale: "fr", subtitle: "  ", tags: [] });
  assert.equal(body, ["Requiem", "", "📅 samedi 14 novembre à 20:00", "📍 Église, Rougemont", `🎟️ Billets dès 35${NBSP}CHF`].join("\n"));
});

test("toutes les dates : trois au plus, lieu par date s'ils diffèrent", () => {
  const sessions = [
    { startsAt: "2026-11-14T19:00:00Z", venue },
    { startsAt: "2026-11-15T16:00:00Z", venue: { name: "Temple", city: "Château-d'Œx" } },
    { startsAt: "2026-11-20T19:00:00Z", venue },
    { startsAt: "2026-11-21T19:00:00Z", venue },
    { startsAt: "2026-11-22T19:00:00Z", venue },
  ];
  const fr = promotionBody({ ...base, locale: "fr", sessions }).split("\n");
  assert.deepEqual(fr.slice(3, 7), [
    "📅 samedi 14 novembre à 20:00 — Église, Rougemont",
    "📅 dimanche 15 novembre à 17:00 — Temple, Château-d'Œx",
    "📅 vendredi 20 novembre à 20:00 — Église, Rougemont",
    "+ 2 autres dates",
  ]);
  assert.ok(!fr.some((l) => l.startsWith("📍")));
  assert.match(promotionBody({ ...base, locale: "de", sessions }), /\+ 2 weitere Termine/);
  assert.match(promotionBody({ ...base, locale: "en", sessions: sessions.slice(0, 4) }), /\+ 1 more date$/m);
  assert.match(promotionBody({ ...base, locale: "it", sessions }), /\+ altre 2 date/);

  // Même lieu partout : une seule ligne de lieu, après les dates.
  const same = promotionBody({ ...base, locale: "fr", sessions: [sessions[0], sessions[2]] }).split("\n");
  assert.deepEqual(same.slice(3, 6), [
    "📅 samedi 14 novembre à 20:00",
    "📅 vendredi 20 novembre à 20:00",
    "📍 Église, Rougemont",
  ]);
});

test("mots-clics : lettres et chiffres, sans doublon, jamais de chiffres seuls", () => {
  assert.equal(hashtag("Grands duos"), "#GrandsDuos");
  assert.equal(hashtag("bel-canto"), "#BelCanto");
  assert.equal(hashtag("Musique d'église"), "#MusiqueDÉglise");
  assert.equal(hashtag("Rock'n'roll"), "#RockNRoll");
  assert.equal(hashtag("ABBA"), "#ABBA");
  assert.equal(hashtag("2026"), null);
  assert.equal(hashtag(" , "), null);
  assert.deepEqual(hashtags(["Jazz", "jazz", "Été 2026", "2026"]), ["#Jazz", "#Été2026"]);
  assert.equal(hashtags(Array.from({ length: 40 }, (_, i) => `tag${i}`)).length, 30);
});

test("lien : cliquable sur Facebook, recopiable sur Instagram, « Infos » sans vente en ligne", () => {
  const body = "Requiem";
  const fb = campaignLink("https://ticketick.ch/", "abcdefgh", "facebook");
  const ig = campaignLink("https://ticketick.ch", "abcdefgh", "instagram");
  assert.equal(fb, "https://ticketick.ch/p/abcdefgh?s=fb");
  assert.equal(ig, "https://ticketick.ch/p/abcdefgh?s=ig");
  assert.equal(campaignLink("https://ticketick.ch", "abcdefgh", "facebook", "post_1"), "https://ticketick.ch/p/abcdefgh?s=fb&p=post_1");
  assert.equal(displayLink(ig), "ticketick.ch/p/abcdefgh?s=ig");

  const message = (channel: "facebook" | "instagram", locale: (typeof PROMOTION_LOCALES)[number], onlineSale = true) =>
    promotionMessage({ body, channel, link: channel === "facebook" ? fb : ig, locale, onlineSale });

  assert.equal(message("facebook", "fr"), `Requiem\n\n👉 Réservez${NBSP}: ${fb}`);
  assert.equal(message("instagram", "fr"), `Requiem\n\n👉 Réservation${NBSP}: lien en bio ou ticketick.ch/p/abcdefgh?s=ig`);
  assert.equal(message("facebook", "de"), `Requiem\n\n👉 Tickets: ${fb}`);
  assert.equal(message("instagram", "en"), "Requiem\n\n👉 Tickets: link in bio or ticketick.ch/p/abcdefgh?s=ig");
  assert.equal(message("facebook", "it"), `Requiem\n\n👉 Prenota: ${fb}`);
  assert.equal(message("facebook", "fr", false), `Requiem\n\n👉 Infos${NBSP}: ${fb}`);
  assert.equal(message("instagram", "it", false), "Requiem\n\n👉 Info: link in bio o ticketick.ch/p/abcdefgh?s=ig");
  // Le corps retouché garde ses retours à la ligne, sans espaces en fin.
  assert.equal(promotionMessage({ body: "A\nB  \n\n", channel: "facebook", link: fb, locale: "en", onlineSale: true }), `A\nB\n\n👉 Book now: ${fb}`);
});

test("déterministe : mêmes données, même texte", () => {
  const input = { ...base, locale: "de" as const };
  assert.equal(promotionBody(input), promotionBody(structuredClone(input)));
});
