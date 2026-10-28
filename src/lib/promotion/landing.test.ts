import assert from "node:assert/strict";
import { test } from "node:test";
import { clickDay, landingPath, type LandingCampaign } from "./landing";
import { postIdFromLinkParam, sourceFromLinkParam, sourceFromUtm } from "./source";

const campaign: LandingCampaign = {
  code: "abcdefgh",
  locale: "fr",
  landing: "go",
  event: { slug: "requiem", visibility: "PUBLIC", organizer: { slug: "cantabile" } },
};

function parse(path: string) {
  const url = new URL(path, "https://ticketick.ch");
  return { pathname: url.pathname, query: Object.fromEntries(url.searchParams) };
}

test("page /go en français, sans préfixe, avec les UTM du § 5.1", () => {
  assert.deepEqual(parse(landingPath(campaign, { source: "facebook", postId: "post_42" })), {
    pathname: "/go/cantabile/requiem",
    query: {
      utm_source: "facebook",
      utm_medium: "social",
      utm_campaign: "tt-abcdefgh",
      utm_content: "post_42",
    },
  });
});

test("sans publication : pas de utm_content", () => {
  const { query } = parse(landingPath(campaign, { source: "link" }));
  assert.equal("utm_content" in query, false);
  assert.equal(query.utm_source, "link");
});

test("langue de la campagne : préfixe sauf pour le français", () => {
  assert.equal(parse(landingPath({ ...campaign, locale: "de" }, { source: "instagram" })).pathname, "/de/go/cantabile/requiem");
  assert.equal(parse(landingPath({ ...campaign, locale: "xx" }, { source: "instagram" })).pathname, "/go/cantabile/requiem");
});

test("page /events pour un événement public", () => {
  const path = landingPath({ ...campaign, landing: "events", locale: "en" }, { source: "code" });
  assert.equal(parse(path).pathname, "/en/events/requiem");
});

test("/events n'affiche qu'un public : un événement non listé retombe sur /go", () => {
  const unlisted = { ...campaign, landing: "events", event: { ...campaign.event, visibility: "UNLISTED" as const } };
  assert.equal(parse(landingPath(unlisted, { source: "code" })).pathname, "/go/cantabile/requiem");
});

test("?s= : liste blanche, le reste devient link", () => {
  assert.equal(sourceFromLinkParam("fb"), "facebook");
  assert.equal(sourceFromLinkParam("IG"), "instagram");
  assert.equal(sourceFromLinkParam("code"), "code");
  assert.equal(sourceFromLinkParam(null), "link");
  assert.equal(sourceFromLinkParam("<script>"), "link");
  assert.equal(sourceFromLinkParam("tiktok"), "link");
});

test("utm_source repris seulement s'il est l'une de nos sources", () => {
  assert.equal(sourceFromUtm("facebook"), "facebook");
  assert.equal(sourceFromUtm("newsletter"), "link");
  assert.equal(sourceFromUtm(undefined), "link");
});

test("?p= : identifiant de publication seulement", () => {
  assert.equal(postIdFromLinkParam("1234567890_98765"), "1234567890_98765");
  assert.equal(postIdFromLinkParam("a b"), null);
  assert.equal(postIdFromLinkParam("x".repeat(65)), null);
  assert.equal(postIdFromLinkParam(null), null);
});

test("jour du clic à Zurich, pas en UTC", () => {
  // 23:30 UTC le 31 octobre = 00:30 le 1er novembre à Zurich (heure d'hiver).
  assert.equal(clickDay(new Date("2026-10-31T23:30:00Z")), "2026-11-01");
  // 22:30 UTC en été = 00:30 le lendemain à Zurich.
  assert.equal(clickDay(new Date("2026-07-14T22:30:00Z")), "2026-07-15");
  assert.equal(clickDay(new Date("2026-07-14T21:30:00Z")), "2026-07-14");
});
