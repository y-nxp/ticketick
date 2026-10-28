import assert from "node:assert/strict";
import { test } from "node:test";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CAMPAIGN_CODE_ALPHABET,
  CAMPAIGN_CODE_LENGTH,
  type CampaignCodeStore,
  campaignUtm,
  codeFromCampaignUtm,
  freeCampaignCode,
  generateCampaignCode,
  isCampaignCode,
  normalizeCampaignCode,
} from "./campaign-code";

// Le client Prisma et une transaction conviennent tels quels (vérifié par tsc).
const acceptsPrisma: (db: PrismaClient | Prisma.TransactionClient) => Promise<string> = freeCampaignCode;
void acceptsPrisma;

test("format : 8 caractères de l'alphabet, en minuscules", () => {
  for (let i = 0; i < 500; i++) {
    const code = generateCampaignCode();
    assert.equal(code.length, CAMPAIGN_CODE_LENGTH);
    assert.match(code, /^[a-z2-9]+$/);
    assert.ok(isCampaignCode(code), code);
  }
});

test("aucun caractère ambigu", () => {
  for (const ambiguous of ["0", "o", "O", "1", "l", "I", "i"]) {
    assert.ok(!CAMPAIGN_CODE_ALPHABET.includes(ambiguous), ambiguous);
  }
  const seen = new Set(Array.from({ length: 2000 }, generateCampaignCode).join(""));
  for (const ambiguous of ["0", "o", "1", "l", "i"]) assert.ok(!seen.has(ambiguous), ambiguous);
});

test("tirages distincts", () => {
  const codes = new Set(Array.from({ length: 5000 }, generateCampaignCode));
  assert.equal(codes.size, 5000);
});

test("validation et saisie", () => {
  assert.equal(isCampaignCode("abcd2345"), true);
  assert.equal(isCampaignCode("abcd234"), false);
  assert.equal(isCampaignCode("abcd23450"), false);
  assert.equal(isCampaignCode("abcd234o"), false);
  assert.equal(isCampaignCode("ABCD2345"), false);
  assert.equal(isCampaignCode("abcd/345"), false);
  assert.equal(normalizeCampaignCode("  ABCD2345 "), "abcd2345");
  assert.equal(normalizeCampaignCode("abcd-2345"), null);
});

test("utm_campaign=tt-{code}, aller et retour", () => {
  const code = generateCampaignCode();
  assert.equal(campaignUtm(code), `tt-${code}`);
  assert.equal(codeFromCampaignUtm(campaignUtm(code)), code);
  assert.equal(codeFromCampaignUtm("TT-ABCD2345"), "abcd2345");
  assert.equal(codeFromCampaignUtm("printemps-2026"), null);
  assert.equal(codeFromCampaignUtm("tt-court"), null);
  assert.equal(codeFromCampaignUtm(null), null);
});

function store(taken: Set<string>, calls: string[]): CampaignCodeStore {
  return {
    promotionCampaign: {
      async findUnique({ where }) {
        calls.push(where.code);
        return taken.has(where.code) ? { id: "c1" } : null;
      },
    },
  };
}

test("unicité en base : un code déjà pris est retiré", async () => {
  const draws = ["abcd2345", "abcd2345", "wxyz6789"];
  const calls: string[] = [];
  const code = await freeCampaignCode(store(new Set(["abcd2345"]), calls), () => draws.shift()!);
  assert.equal(code, "wxyz6789");
  assert.deepEqual(calls, ["abcd2345", "abcd2345", "wxyz6789"]);
});

test("unicité en base : abandon après cinq collisions", async () => {
  const calls: string[] = [];
  await assert.rejects(
    freeCampaignCode(store(new Set(["abcd2345"]), calls), () => "abcd2345"),
    /aucun code de campagne libre/,
  );
  assert.equal(calls.length, 5);
});

test("unicité en base : tirage réel", async () => {
  const code = await freeCampaignCode(store(new Set(), []));
  assert.ok(isCampaignCode(code));
});
