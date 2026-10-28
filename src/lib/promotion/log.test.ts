import assert from "node:assert/strict";
import { test } from "node:test";
import { LOG_DETAIL_MAX, logPostAction, postLogRow, redactSecrets, type PostLogRow } from "./log";

const TOKEN = "EAAGm0PX4ZCpsBAKZCsecretsecretsecret";

test("ligne du journal : champs nommés, valeurs nettoyées", () => {
  const row = postLogRow({
    postId: "p1",
    action: "publish",
    ok: false,
    httpStatus: 503,
    errorCode: "TRANSIENT:2",
    detail: "  erreur   transitoire\n(tentative 1) ",
  });
  assert.deepEqual(row, {
    postId: "p1",
    action: "publish",
    ok: false,
    httpStatus: 503,
    errorCode: "TRANSIENT:2",
    detail: "erreur transitoire (tentative 1)",
  });
  assert.equal(postLogRow({ postId: "p1", action: "claim", ok: true }).detail, null);
  assert.equal(postLogRow({ postId: "p1", action: "claim", ok: true, httpStatus: 42 }).httpStatus, null);
});

test("jetons masqués, dans le détail comme dans le code", () => {
  const row = postLogRow({
    postId: "p1",
    action: "publish",
    ok: false,
    errorCode: `190&access_token=${TOKEN}`,
    detail: `GET /me?access_token=${TOKEN} Authorization: Bearer ${TOKEN} ${TOKEN}`,
  });
  assert.ok(!JSON.stringify(row).includes(TOKEN));
  assert.ok(!JSON.stringify(row).includes("secret"));
  assert.match(row.detail!, /\[masqué\]/);
  assert.ok(!redactSecrets(`appsecret_proof=abc123&x=1`).includes("abc123"));
});

test("détail tronqué", () => {
  const row = postLogRow({ postId: "p1", action: "cancel", ok: false, detail: "mot ".repeat(200) });
  assert.equal(row.detail!.length, LOG_DETAIL_MAX);
  assert.ok(row.detail!.endsWith("…"));
});

test("journal indisponible : la minuterie continue, sans rien afficher du contenu", async () => {
  const printed: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => printed.push(args.map(String).join(" "));
  try {
    await logPostAction(
      async () => {
        throw new Error(`base indisponible ${TOKEN}`);
      },
      { postId: "p1", action: "publish", ok: false, detail: "x" },
    );
  } finally {
    console.error = original;
  }
  assert.equal(printed.length, 1);
  assert.ok(!printed[0]!.includes(TOKEN));

  const rows: PostLogRow[] = [];
  await logPostAction(async (row) => void rows.push(row), { postId: "p1", action: "orphan", ok: false, errorCode: "ORPHANED" });
  assert.equal(rows[0]!.errorCode, "ORPHANED");
});
