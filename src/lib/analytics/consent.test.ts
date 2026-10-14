import { test } from "node:test";
import assert from "node:assert/strict";
import { ALL_DENIED, ALL_GRANTED, googleConsentState, parseConsent, serializeConsent } from "./consent";

test("legacy binary values map to all or nothing", () => {
  assert.deepEqual(parseConsent("granted"), ALL_GRANTED);
  assert.deepEqual(parseConsent("denied"), ALL_DENIED);
});

test("granular value round-trips", () => {
  const consent = { statistics: true, ads: false, personalization: false };
  assert.equal(serializeConsent(consent), "s1.a0.p0");
  assert.deepEqual(parseConsent("s1.a0.p0"), consent);
});

test("personalization requires ads", () => {
  assert.deepEqual(parseConsent("s0.a0.p1"), ALL_DENIED);
  assert.equal(serializeConsent({ statistics: false, ads: false, personalization: true }), "s0.a0.p0");
});

test("unknown or missing values mean no choice yet", () => {
  assert.equal(parseConsent(undefined), null);
  assert.equal(parseConsent("yes"), null);
  assert.equal(parseConsent("s1.a1"), null);
});

test("Google states follow each purpose", () => {
  assert.deepEqual(googleConsentState({ statistics: true, ads: true, personalization: false }), {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  assert.equal(googleConsentState(null).analytics_storage, "denied");
});
