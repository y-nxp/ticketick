import assert from "node:assert/strict";
import { test } from "node:test";
import type { PromotionPostStatus } from "@prisma/client";
import { demoProvider } from "./demo-provider";
import type { PostLogRow } from "./log";
import { PromotionProviderError, type PromotionProvider, type PublishAccount } from "./provider";
import {
  buildFailureEmail,
  MAX_PUBLISH_ATTEMPTS,
  retryFailedPost,
  runPublisherPass,
  type FailureEmail,
  type PostForPublish,
  type PostUpdate,
  type PostWhere,
  type PublisherDeps,
  type PublisherStore,
} from "./publisher";

/**
 * La minuterie sur un dépôt en mémoire. `updatePost` y est atomique comme le
 * `updateMany` de Prisma : la condition est relue et l'écriture faite dans le
 * même tour de boucle, après une attente qui laisse deux passages
 * concurrents s'entrelacer.
 */

const MIN = 60 * 1000;
const T0 = new Date("2026-11-02T09:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * MIN);
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

type Account = PublishAccount & { name: string; lastError: string | null };

function makeEvent(overrides: Partial<PostForPublish["campaign"]["event"]> = {}) {
  return {
    title: { fr: "Le Misanthrope", en: "The Misanthrope", de: "Der Menschenfeind", it: "Il misantropo" },
    status: "PUBLISHED" as const,
    visibility: "PUBLIC" as const,
    onlineSale: true,
    sessions: [{ startsAt: at(7 * 24 * 60), status: "PUBLISHED" as const }],
    ...overrides,
  };
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: "acc-fb",
    provider: "FACEBOOK_PAGE",
    externalId: "1234567890",
    status: "ACTIVE",
    tokenEnc: "sealed-token",
    viaAccountId: null,
    name: "Théâtre du Lac",
    lastError: null,
    ...overrides,
  };
}

interface MemPost extends Omit<PostForPublish, "account"> {
  account: Account;
  externalId: string | null;
  permalink: string | null;
  publishedAt: Date | null;
  lastError: string | null;
}

function makePost(id: string, overrides: Partial<MemPost> = {}): MemPost {
  return {
    id,
    status: "SCHEDULED",
    message: "Venez voir Le Misanthrope !",
    imagePath: "/uploads/promotion/org-1/affiche.jpg",
    linkUrl: "https://ticketick.ch/p/ABCDEFGH?s=fb",
    attempts: 0,
    scheduledAt: T0,
    claimedAt: null,
    externalId: null,
    permalink: null,
    publishedAt: null,
    lastError: null,
    account: makeAccount(),
    campaign: {
      name: "Lancement",
      event: makeEvent(),
      organizer: {
        id: "org-1",
        name: "Théâtre du Lac",
        notifyEmails: ["billetterie@theatre.ch"],
        reportEmails: [],
        locale: "fr",
      },
    },
    ...overrides,
  };
}

function matches(post: MemPost, where: PostWhere): boolean {
  const statuses: PromotionPostStatus[] = Array.isArray(where.status) ? where.status : [where.status];
  if (post.id !== where.id || !statuses.includes(post.status)) return false;
  if (where.claimedAt !== undefined) {
    if (where.claimedAt === null ? post.claimedAt !== null : post.claimedAt?.getTime() !== where.claimedAt.getTime()) {
      return false;
    }
  }
  if (where.scheduledAtLte && !(post.scheduledAt && post.scheduledAt <= where.scheduledAtLte)) return false;
  return true;
}

function memoryStore(posts: MemPost[]) {
  const byId = new Map(posts.map((p) => [p.id, p]));
  const logs: PostLogRow[] = [];
  const store: PublisherStore = {
    async listOrphans(claimedBefore) {
      await tick();
      return posts
        .filter((p) => p.status === "PUBLISHING" && p.claimedAt && p.claimedAt < claimedBefore)
        .map((p) => ({ id: p.id, claimedAt: p.claimedAt! }));
    },
    async listDue(now, limit) {
      await tick();
      return posts
        .filter((p) => p.status === "SCHEDULED" && p.scheduledAt && p.scheduledAt <= now)
        .slice(0, limit)
        .map((p) => ({
          id: p.id,
          account: { id: p.account.id, provider: p.account.provider, externalId: p.account.externalId },
        }));
    },
    async updatePost(where: PostWhere, data: PostUpdate) {
      await tick();
      // Lecture et écriture dans le même tour : atomique.
      const post = byId.get(where.id);
      if (!post || !matches(post, where)) return 0;
      Object.assign(post, data);
      return 1;
    },
    async loadPost(id) {
      await tick();
      const post = byId.get(id);
      return post ? structuredClone(post) : null;
    },
    async recentPublishTimes(accountId, since) {
      await tick();
      return posts.flatMap((p) => {
        if (p.account.id !== accountId) return [];
        const time = p.status === "PUBLISHED" ? p.publishedAt : p.status === "PUBLISHING" ? p.claimedAt : null;
        return time && time > since ? [time] : [];
      });
    },
    async markAccountNeedsReconnect(accountId, lastError) {
      await tick();
      for (const p of posts) {
        if (p.account.id === accountId && p.account.status === "ACTIVE") {
          p.account.status = "NEEDS_RECONNECT";
          p.account.lastError = lastError;
        }
      }
    },
    async wasOrphaned(postId) {
      return logs.some((l) => l.postId === postId && l.action === "orphan");
    },
    async writeLog(row) {
      await tick();
      logs.push(row);
    },
  };
  return { store, logs, byId };
}

/** Éditeur de test : compte ses appels, et lève ce qu'on lui donne. */
function scriptedProvider(outcome: () => Error | null = () => null) {
  const calls: string[] = [];
  const provider: PromotionProvider = {
    name: "test",
    async publish(post) {
      calls.push(post.id);
      await tick();
      const error = outcome();
      if (error) throw error;
      return { externalId: `ext-${post.id}`, permalink: `https://facebook.test/${post.id}` };
    },
  };
  return { provider, calls };
}

function setup(posts: MemPost[], provider: PromotionProvider | null, options: Partial<PublisherDeps> = {}) {
  const mem = memoryStore(posts);
  const emails: FailureEmail[] = [];
  const warnings: string[] = [];
  let now = T0;
  const deps: PublisherDeps = {
    store: mem.store,
    resolveProvider: () => provider,
    notify: async (email) => {
      emails.push(email);
    },
    origin: "https://ticketick.ch",
    now: () => now,
    warn: (message) => warnings.push(message),
    ...options,
  };
  return {
    ...mem,
    emails,
    warnings,
    run: (minutes = 0) => {
      now = at(minutes);
      return runPublisherPass(deps);
    },
  };
}

test("réussite : PUBLISHED avec identifiant, permalien, date et journal", async () => {
  const { provider, calls } = scriptedProvider();
  const env = setup([makePost("p1")], provider);
  const summary = await env.run(0);
  const post = env.byId.get("p1")!;
  assert.equal(summary.published, 1);
  assert.deepEqual(calls, ["p1"]);
  assert.equal(post.status, "PUBLISHED");
  assert.equal(post.externalId, "ext-p1");
  assert.equal(post.permalink, "https://facebook.test/p1");
  assert.deepEqual(post.publishedAt, T0);
  assert.deepEqual(post.claimedAt, T0);
  assert.equal(post.attempts, 1);
  assert.deepEqual(
    env.logs.map((l) => [l.action, l.ok]),
    [
      ["claim", true],
      ["publish", true],
    ],
  );
  assert.equal(env.emails.length, 0);
});

test("l'heure non atteinte, un brouillon ou une annulée ne sont pas pris", async () => {
  const { provider, calls } = scriptedProvider();
  const env = setup(
    [
      makePost("later", { scheduledAt: at(10) }),
      makePost("draft", { status: "DRAFT" }),
      makePost("cancelled", { status: "CANCELLED" }),
    ],
    provider,
  );
  await env.run(0);
  assert.deepEqual(calls, []);
  assert.equal(env.byId.get("later")!.status, "SCHEDULED");
  await env.run(10);
  assert.deepEqual(calls, ["later"]);
  assert.equal(env.byId.get("draft")!.status, "DRAFT");
  assert.equal(env.byId.get("cancelled")!.status, "CANCELLED");
});

test("réservation : deux minuteries concurrentes, une seule publie", async () => {
  const { provider, calls } = scriptedProvider();
  const env = setup([makePost("p1"), makePost("p2")], provider);
  const [a, b] = await Promise.all([env.run(0), env.run(0)]);
  assert.deepEqual(calls.sort(), ["p1", "p2"]);
  assert.equal(a.published + b.published, 2);
  assert.equal(env.logs.filter((l) => l.action === "claim").length, 2);
  assert.equal(env.logs.filter((l) => l.action === "publish").length, 2);
});

test("idempotence : relancer la minuterie ne republie rien et ne renvoie aucun courriel", async () => {
  const { provider, calls } = scriptedProvider();
  const failing = scriptedProvider(() => new PromotionProviderError("PERMANENT", { httpStatus: 400, code: "100" }));
  const env = setup([makePost("ok"), makePost("ko", { account: makeAccount({ id: "acc-2" }) })], null, {
    resolveProvider: (account) => (account.id === "acc-2" ? failing.provider : provider),
  });
  for (let i = 0; i < 4; i++) await env.run(i);
  assert.deepEqual(calls, ["ok"]);
  assert.deepEqual(failing.calls, ["ko"]);
  assert.equal(env.emails.length, 1);
  assert.equal(env.byId.get("ko")!.status, "FAILED");
  assert.equal(env.logs.length, 4);
});

test("erreur transitoire : nouvelles tentatives à 5, 15 puis 45 min, puis FAILED et un courriel", async () => {
  const { provider, calls } = scriptedProvider(() => new PromotionProviderError("TRANSIENT", { httpStatus: 503 }));
  const env = setup([makePost("p1")], provider);
  const post = env.byId.get("p1")!;

  await env.run(0);
  assert.equal(post.status, "SCHEDULED");
  assert.equal(post.attempts, 1);
  assert.deepEqual(post.scheduledAt, at(5));
  assert.equal(post.claimedAt, null, "redevenue modifiable entre deux tentatives");

  await env.run(4);
  assert.equal(calls.length, 1, "pas avant le délai");

  await env.run(5);
  assert.equal(post.attempts, 2);
  assert.deepEqual(post.scheduledAt, at(5 + 15));

  await env.run(20);
  assert.equal(post.attempts, 3);
  assert.deepEqual(post.scheduledAt, at(20 + 45));
  assert.equal(env.emails.length, 0, "aucun courriel pendant les tentatives");

  await env.run(65);
  assert.equal(calls.length, MAX_PUBLISH_ATTEMPTS);
  assert.equal(post.status, "FAILED");
  assert.equal(post.attempts, 4);
  assert.match(post.lastError!, /4 tentatives/);
  assert.equal(env.emails.length, 1);
  assert.match(env.emails[0]!.action, /réessayer/);

  await env.run(200);
  assert.equal(calls.length, MAX_PUBLISH_ATTEMPTS, "plus rien après FAILED");
  assert.deepEqual(
    env.logs.filter((l) => l.action === "retry").map((l) => l.detail?.split(" (")[0]),
    ["nouvelle tentative dans 5 min", "nouvelle tentative dans 15 min", "nouvelle tentative dans 45 min"],
  );
  assert.ok(env.logs.filter((l) => l.action === "publish").every((l) => !l.ok && l.httpStatus === 503));
});

test("erreur transitoire puis réussite (éditeur de démonstration)", async () => {
  const env = setup([makePost("p1", { message: "Venez ! [demo:transient:1]" })], demoProvider);
  await env.run(0);
  assert.equal(env.byId.get("p1")!.status, "SCHEDULED");
  await env.run(5);
  const post = env.byId.get("p1")!;
  assert.equal(post.status, "PUBLISHED");
  assert.equal(post.attempts, 2);
  assert.equal(post.lastError, null);
  assert.match(post.permalink!, /^https:\/\/demo\.invalid\//);
});

test("erreur de jeton : compte NEEDS_RECONNECT, publication FAILED, puis plus d'appel pour ce compte", async () => {
  const { provider, calls } = scriptedProvider(() => new PromotionProviderError("TOKEN", { httpStatus: 400, code: "190" }));
  const account = makeAccount();
  const env = setup(
    [makePost("p1", { account }), makePost("p2", { account, scheduledAt: at(30) })],
    provider,
  );

  await env.run(0);
  const first = env.byId.get("p1")!;
  assert.equal(first.status, "FAILED");
  assert.equal(first.account.status, "NEEDS_RECONNECT");
  assert.equal(env.emails.length, 1);
  assert.match(env.emails[0]!.action, /Reconnectez/);
  assert.equal(env.logs.find((l) => l.action === "publish")!.errorCode, "TOKEN:190");

  await env.run(30);
  const second = env.byId.get("p2")!;
  assert.equal(second.status, "FAILED");
  assert.match(second.lastError!, /reconnecté/);
  assert.deepEqual(calls, ["p1"], "compte à reconnecter : l'éditeur n'est pas appelé");
  assert.equal(env.logs.at(-1)!.errorCode, "ACCOUNT_INACTIVE");
  assert.equal(env.emails.length, 2);
});

test("erreur permanente ou imprévue : FAILED d'emblée, sans nouvelle tentative", async () => {
  for (const error of [new PromotionProviderError("PERMANENT", { httpStatus: 400 }), new TypeError("boom")]) {
    const { provider, calls } = scriptedProvider(() => error);
    const env = setup([makePost("p1")], provider);
    await env.run(0);
    await env.run(60);
    assert.equal(calls.length, 1);
    assert.equal(env.byId.get("p1")!.status, "FAILED");
    assert.equal(env.byId.get("p1")!.attempts, 1);
    assert.equal(env.emails.length, 1);
  }
});

test("garde de promouvabilité au moment de publier : annulé, passé, MEMBERS, complet → CANCELLED", async () => {
  const cases: [string, ReturnType<typeof makeEvent>, RegExp][] = [
    ["annulé", makeEvent({ status: "CANCELLED" }), /annulé/],
    ["passé", makeEvent({ sessions: [{ startsAt: at(-60), status: "PUBLISHED" }] }), /plus aucune séance/],
    ["members", makeEvent({ visibility: "MEMBERS" }), /communauté/],
    ["complet", makeEvent({ status: "SOLD_OUT" }), /complet/],
    ["brouillon", makeEvent({ status: "DRAFT" }), /brouillon/],
  ];
  for (const [label, event, reason] of cases) {
    const { provider, calls } = scriptedProvider();
    const post = makePost("p1");
    post.campaign.event = event;
    const env = setup([post], provider);
    const summary = await env.run(0);
    const stored = env.byId.get("p1")!;
    assert.equal(stored.status, "CANCELLED", label);
    assert.equal(summary.cancelled, 1, label);
    assert.deepEqual(calls, [], `${label} : l'éditeur n'est pas appelé`);
    assert.match(stored.lastError!, reason, label);
    assert.equal(env.logs.at(-1)!.action, "cancel", label);
    assert.equal(env.emails.length, 1, label);
    assert.match(env.emails[0]!.subject, /annulée/, label);
    await env.run(1);
    assert.equal(env.emails.length, 1, `${label} : un seul courriel`);
  }
});

test("la garde relit l'événement après la réservation", async () => {
  const { provider, calls } = scriptedProvider();
  const post = makePost("p1");
  const env = setup([post], provider);
  // Annulé entre la liste des publications dues et la réservation.
  const listDue = env.store.listDue.bind(env.store);
  env.store.listDue = async (now, limit) => {
    const due = await listDue(now, limit);
    env.byId.get("p1")!.campaign.event.status = "CANCELLED";
    return due;
  };
  await env.run(0);
  assert.equal(env.byId.get("p1")!.status, "CANCELLED");
  assert.deepEqual(calls, []);
});

test("PUBLISHING orphelin : FAILED après 15 min, jamais republié, réessai refusé", async () => {
  const { provider, calls } = scriptedProvider();
  const env = setup([makePost("p1", { status: "PUBLISHING", claimedAt: at(0) })], provider);

  await env.run(14);
  assert.equal(env.byId.get("p1")!.status, "PUBLISHING", "pas avant 15 min");

  const summary = await env.run(16);
  const post = env.byId.get("p1")!;
  assert.equal(summary.orphaned, 1);
  assert.equal(post.status, "FAILED");
  assert.match(post.lastError!, /état est inconnu, à vérifier chez la plateforme/);
  assert.deepEqual(calls, []);
  const orphan = env.logs.find((l) => l.action === "orphan")!;
  assert.equal(orphan.errorCode, "ORPHANED");
  assert.equal(orphan.ok, false);
  assert.equal(env.emails.length, 1);
  assert.match(env.emails[0]!.action, /Ne la republiez pas/);
  assert.equal(env.warnings.length, 1);

  assert.deepEqual(await retryFailedPost(env.store, "p1", at(20)), { ok: false, error: "retryUnsafe" });
  assert.equal(post.status, "FAILED");

  await env.run(30);
  assert.deepEqual(calls, []);
  assert.equal(env.emails.length, 1, "un seul courriel");
});

test("orphelin concurrent : deux passages, un seul courriel", async () => {
  const env = setup([makePost("p1", { status: "PUBLISHING", claimedAt: at(0) })], null);
  await Promise.all([env.run(20), env.run(20)]);
  assert.equal(env.emails.length, 1);
  assert.equal(env.logs.filter((l) => l.action === "orphan").length, 1);
});

test("« Réessayer » : FAILED → SCHEDULED à l'instant, tentatives remises à zéro, puis publiée", async () => {
  let fail = true;
  const { provider, calls } = scriptedProvider(() => (fail ? new PromotionProviderError("PERMANENT") : null));
  const env = setup([makePost("p1")], provider);
  await env.run(0);
  assert.equal(env.byId.get("p1")!.status, "FAILED");

  fail = false;
  assert.deepEqual(await retryFailedPost(env.store, "p1", at(10)), { ok: true });
  const post = env.byId.get("p1")!;
  assert.equal(post.status, "SCHEDULED");
  assert.equal(post.attempts, 0);
  assert.equal(post.lastError, null);
  assert.equal(post.claimedAt, null);
  assert.deepEqual(post.scheduledAt, at(10));
  assert.equal(env.logs.at(-1)!.action, "retry");

  assert.deepEqual(await retryFailedPost(env.store, "p1", at(10)), { ok: false, error: "postLocked" });

  await env.run(11);
  assert.equal(post.status, "PUBLISHED");
  assert.equal(calls.length, 2);
});

test("« Réessayer » refusé hors FAILED", async () => {
  for (const status of ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "CANCELLED"] as const) {
    const env = setup([makePost("p1", { status })], null);
    assert.deepEqual(await retryFailedPost(env.store, "p1"), { ok: false, error: "postLocked" }, status);
    assert.equal(env.byId.get("p1")!.status, status);
  }
});

test("sans éditeur : la publication reste SCHEDULED, rien n'est marqué FAILED, un seul avertissement", async () => {
  const env = setup([makePost("p-wait")], null);
  await env.run(0);
  await env.run(1);
  const post = env.byId.get("p-wait")!;
  assert.equal(post.status, "SCHEDULED");
  assert.equal(post.claimedAt, null);
  assert.equal(env.logs.length, 0);
  assert.equal(env.emails.length, 0);
  assert.equal(env.warnings.filter((w) => w.includes("p-wait")).length, 1);
});

test("un courriel qui échoue ne change pas l'état", async () => {
  const { provider } = scriptedProvider(() => new PromotionProviderError("PERMANENT"));
  const env = setup([makePost("p1")], provider, {
    notify: async () => {
      throw new Error("SMTP indisponible");
    },
  });
  const original = console.error;
  console.error = () => {};
  try {
    await env.run(0);
  } finally {
    console.error = original;
  }
  assert.equal(env.byId.get("p1")!.status, "FAILED");
});

test("journal, lastError, courriels et avertissements sans jeton ni corps de réponse", async () => {
  const SECRET = "EAAGsecretTOKEN1234567890abcdef";
  const errors: Error[] = [
    new PromotionProviderError("TRANSIENT", {
      httpStatus: 500,
      code: `1&access_token=${SECRET}`,
      message: `GET https://graph.facebook.com/v23.0/me?access_token=${SECRET} {"error":{"message":"${SECRET}"}}`,
    }),
    new PromotionProviderError("TOKEN", { httpStatus: 400, code: "190", message: `token ${SECRET} expired` }),
    new PromotionProviderError("PERMANENT", { message: SECRET }),
    new Error(`fetch failed for access_token=${SECRET}`),
  ];
  const printed: string[] = [];
  const original = { error: console.error, warn: console.warn, log: console.log };
  const capture = (...args: unknown[]) => printed.push(args.map(String).join(" "));
  console.error = capture;
  console.warn = capture;
  console.log = capture;
  try {
    for (const error of errors) {
      const { provider } = scriptedProvider(() => error);
      const post = makePost("p1", { account: makeAccount({ tokenEnc: SECRET }) });
      const env = setup([post], provider);
      await env.run(0);
      await env.run(60);
      const stored = env.byId.get("p1")!;
      const written = JSON.stringify({
        logs: env.logs,
        lastError: stored.lastError,
        accountError: stored.account.lastError,
        emails: env.emails,
        warnings: env.warnings,
      });
      assert.ok(!written.includes(SECRET), `fuite : ${written}`);
      assert.ok(!written.includes("graph.facebook.com"));
      assert.ok(env.logs.length > 0);
    }
  } finally {
    Object.assign(console, original);
  }
  assert.ok(!printed.join("\n").includes(SECRET), "console");
});

test("débit : au 51ᵉ en 24 h sur un compte Instagram, report à la sortie de la plus ancienne", async () => {
  const ig = makeAccount({ id: "acc-ig", provider: "INSTAGRAM_BUSINESS" });
  const published = Array.from({ length: 50 }, (_, i) =>
    makePost(`old-${i}`, {
      status: "PUBLISHED",
      account: ig,
      // Une toutes les 20 min depuis -23 h 50 : la plus ancienne sort à +10 min.
      publishedAt: at(-23 * 60 - 50 + i * 20),
    }),
  );
  const { provider, calls } = scriptedProvider();
  const posts = [...published, makePost("new", { account: ig })];
  for (const p of posts) p.account = ig;
  const env = setup(posts, provider);

  const summary = await env.run(0);
  const post = env.byId.get("new")!;
  assert.equal(summary.deferred, 1);
  assert.deepEqual(calls, []);
  assert.equal(post.status, "SCHEDULED");
  assert.deepEqual(post.scheduledAt, at(10));
  const line = env.logs.find((l) => l.action === "rate_limit")!;
  assert.equal(line.errorCode, "RATE_LIMIT");
  assert.match(line.detail!, /50\/50/);
  assert.equal(env.warnings.length, 1);

  await env.run(5);
  assert.deepEqual(calls, [], "toujours dans la fenêtre");
  assert.equal(env.logs.filter((l) => l.action === "rate_limit").length, 1, "pas de nouvelle ligne avant l'heure");

  await env.run(10);
  assert.deepEqual(calls, ["new"]);
  assert.equal(post.status, "PUBLISHED");
});

test("débit : 49 en 24 h passent, une publication en cours compte, Facebook n'est pas limité", async () => {
  const ig = makeAccount({ id: "acc-ig", provider: "INSTAGRAM_BUSINESS" });
  const recent = (n: number, account: Account) =>
    Array.from({ length: n }, (_, i) =>
      makePost(`old-${account.id}-${i}`, { status: "PUBLISHED", account, publishedAt: at(-60 - i) }),
    );
  const { provider, calls } = scriptedProvider();
  const posts = [...recent(49, ig), makePost("a", { account: ig }), makePost("b", { account: ig })];
  for (const p of posts) p.account = ig;
  const env = setup(posts, provider);
  await env.run(0);
  assert.deepEqual(calls, ["a"], "le 50ᵉ passe, le 51ᵉ attend");
  assert.equal(env.byId.get("b")!.status, "SCHEDULED");

  const fb = makeAccount({ id: "acc-fb" });
  const fbPosts = [...recent(60, fb), makePost("c", { account: fb })];
  const fbEnv = setup(fbPosts, scriptedProvider().provider);
  await fbEnv.run(0);
  assert.equal(fbEnv.byId.get("c")!.status, "PUBLISHED");
});

test("courriel d'échec : publication, motif, quoi faire, lien, langue de l'organisateur", () => {
  const post = makePost("p1", { scheduledAt: new Date("2026-11-02T18:30:00Z") });
  const email = buildFailureEmail(post, { code: "token" }, { origin: "https://ticketick.ch/" });
  assert.equal(email.subject, "Publication Facebook non parue — Le Misanthrope");
  assert.deepEqual(
    email.facts.map((f) => f.value),
    ["Le Misanthrope", "Lancement", "Facebook · Théâtre du Lac", email.facts[3]!.value],
  );
  assert.match(email.facts[3]!.value, /19:30/, "heure de Zurich");
  assert.match(email.reason, /Facebook a refusé/);
  assert.match(email.action, /Reconnectez/);
  assert.equal(email.link.url, "https://ticketick.ch/fr/admin/promotion/publications/p1");
  assert.deepEqual(email.organizer, { notifyEmails: ["billetterie@theatre.ch"], reportEmails: [] });

  post.campaign.organizer.locale = "de";
  const german = buildFailureEmail(post, { code: "notPromotable", blockers: ["cancelled"] }, { origin: "https://ticketick.ch" });
  assert.match(german.subject, /storniert — Der Menschenfeind/);
  assert.match(german.link.url, /\/de\/admin\//);

  post.campaign.organizer.locale = "es";
  assert.match(buildFailureEmail(post, { code: "permanent" }, { origin: "https://ticketick.ch" }).heading, /n’a pas pu paraître/);
});
