import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { PromotionPostStatus, SocialAccountStatus, SocialProvider } from "@prisma/client";

/**
 * Textes de l'interface du module : mêmes clés dans les quatre langues du
 * backoffice, et un libellé pour chaque valeur que le code peut afficher.
 */

const LOCALES = ["fr", "de", "en", "it"] as const;
type Tree = { [key: string]: string | Tree };

const messages = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(join(process.cwd(), "messages", `${l}.json`), "utf8"))]),
) as Record<(typeof LOCALES)[number], { admin: Tree & { promotion: Tree; nav: Tree; form: { errors: Tree } } }>;

function keys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : keys(v, `${prefix}${k}.`),
  );
}

/** Erreurs que les actions du module peuvent renvoyer. */
const ERRORS = [
  "notPromotable",
  "notPreparable",
  "scheduleRequired",
  "scheduleInPast",
  "scheduleInvalid",
  "postLocked",
  "sessionInvalid",
  "localeInvalid",
  "landingInvalid",
  "nameRequired",
  "channelRequired",
  "accountInvalid",
  "imageInvalid",
  "imageRequired",
  "imageExternal",
  "imageMissing",
  "imageUnsupported",
  "imageTooLarge",
  "imageType",
  "messageRequired",
  "messageTooLong",
  "forbidden",
  "intentInvalid",
  "notFound",
  "unavailable",
];

test("admin.promotion : mêmes clés en fr, de, en et it, aucune vide", () => {
  const reference = keys(messages.fr.admin.promotion).sort();
  for (const locale of LOCALES) {
    assert.deepEqual(keys(messages[locale].admin.promotion).sort(), reference, locale);
    const empty = reference.filter((k) => {
      const value = k.split(".").reduce<string | Tree>((node, part) => (node as Tree)[part], messages[locale].admin.promotion);
      return typeof value !== "string" || !value.trim();
    });
    assert.deepEqual(empty, [], locale);
    assert.ok(messages[locale].admin.nav.promotion, `${locale} nav`);
  }
});

test("admin.promotion : mêmes paramètres {…} dans chaque langue", () => {
  const params = (locale: (typeof LOCALES)[number]) =>
    Object.fromEntries(
      keys(messages[locale].admin.promotion).map((k) => {
        const value = k.split(".").reduce<string | Tree>((node, part) => (node as Tree)[part], messages[locale].admin.promotion);
        return [k, [...String(value).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()];
      }),
    );
  const reference = params("fr");
  for (const locale of LOCALES) assert.deepEqual(params(locale), reference, locale);
});

test("chaque erreur, statut, fournisseur et motif a son libellé", () => {
  const blockers = ["draft", "cancelled", "soldOut", "past", "members", "noSession", "sessionsSoldOut"];
  const warnings = ["linkNotClickable", "truncated", "tooLong", "tooManyHashtags", "imageRequired", "imageCropped"];
  for (const locale of LOCALES) {
    const { promotion, form } = messages[locale].admin;
    const missing = (tree: unknown, wanted: string[]) => wanted.filter((k) => !(tree as Tree)[k]);
    assert.deepEqual(missing(form.errors, ERRORS), [], `${locale} erreurs`);
    assert.deepEqual(missing(promotion.status, Object.values(PromotionPostStatus)), [], `${locale} statuts`);
    const accounts = promotion.accounts as Tree;
    assert.deepEqual(missing(accounts.provider, Object.values(SocialProvider)), [], `${locale} fournisseurs`);
    assert.deepEqual(missing(accounts.status, Object.values(SocialAccountStatus)), [], `${locale} comptes`);
    assert.deepEqual(missing(promotion.blockers, blockers), [], `${locale} motifs`);
    assert.deepEqual(missing(promotion.warnings, warnings), [], `${locale} avertissements`);
  }
});
