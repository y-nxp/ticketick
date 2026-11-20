import { test } from "node:test";
import assert from "node:assert/strict";
import { internalPath, legacyRedirect, localizePath, middlewarePathnames } from "./pathnames";

const LOCALES = ["fr", "en", "de", "it", "es"] as const;

test("internal path → path shown in each language", () => {
  assert.equal(localizePath("/pricing", "fr"), "/tarifs");
  assert.equal(localizePath("/pricing", "de"), "/preise");
  assert.equal(localizePath("/pricing", "en"), "/pricing");
  assert.equal(localizePath("/organizer#contact", "fr"), "/organisateurs#contact");
  assert.equal(localizePath("/events/gnymf-2027-01-01-x?utm=1", "it"), "/spettacoli/gnymf-2027-01-01-x?utm=1");
  assert.equal(localizePath("/events/abc", "es"), "/eventos/abc");
  assert.equal(localizePath("/about", "es"), "/about");
  // Pages non traduites, sous-pages comprises.
  assert.equal(localizePath("/organizer/dashboard", "fr"), "/organizer/dashboard");
  assert.equal(localizePath("/about/team/x.jpg", "fr"), "/about/team/x.jpg");
  assert.equal(localizePath("/cart", "de"), "/cart");
  assert.equal(localizePath("/", "fr"), "/");
});

test("shown path → internal path, whatever the language", () => {
  assert.equal(internalPath("/tarifs", "fr"), "/pricing");
  assert.equal(internalPath("/tarifs", "de"), "/pricing");
  assert.equal(internalPath("/spectacles/abc", "fr"), "/events/abc");
  assert.equal(internalPath("/events/abc", "fr"), "/events/abc");
  assert.equal(internalPath("/wie-es-funktioniert"), "/how-it-works");
  assert.equal(internalPath("/go/org/event", "fr"), "/go/org/event");
});

test("old English path redirects to the language's path", () => {
  const r = (p: string) => legacyRedirect(p, LOCALES, "fr");
  assert.deepEqual(r("/pricing"), { pathname: "/tarifs", status: 308 });
  assert.deepEqual(r("/de/pricing"), { pathname: "/de/preise", status: 308 });
  assert.deepEqual(r("/it/how-it-works"), { pathname: "/it/come-funziona", status: 308 });
  assert.deepEqual(r("/events/beethoven-cantabile-2026"), {
    pathname: "/spectacles/beethoven-cantabile-2026",
    status: 308,
  });
  assert.deepEqual(r("/es/events/abc"), { pathname: "/es/eventos/abc", status: 308 });
  assert.equal(r("/en/pricing"), null);
  assert.equal(r("/es/pricing"), null);
  assert.equal(r("/tarifs"), null);
  assert.equal(r("/organizer/dashboard"), null);
  assert.equal(r("/admin/events/abc"), null);
});

test("Gstaad concerts redirect temporarily (302)", () => {
  const r = (p: string) => legacyRedirect(p, LOCALES, "fr");
  assert.deepEqual(r("/events/gnymf-2026-12-29-grigolo"), {
    pathname: "/spectacles/gnymf-2026-12-29-grigolo",
    status: 302,
  });
  assert.deepEqual(r("/de/events/gnymf-2026-12-29-grigolo"), {
    pathname: "/de/veranstaltungen/gnymf-2026-12-29-grigolo",
    status: 302,
  });
  assert.equal(r("/en/events/gnymf-2026-12-29-grigolo"), null);
});

test("middleware table names every language", () => {
  const table = middlewarePathnames(LOCALES);
  assert.equal(table["/pricing"].en, "/pricing");
  assert.equal(table["/pricing"].fr, "/tarifs");
  assert.equal(table["/events/[slug]"].es, "/eventos/[slug]");
});
