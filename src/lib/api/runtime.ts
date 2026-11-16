import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { ApiError } from "./errors";
import { describeIssues } from "./input";
import { hashApiKey, isApiKeyShape, readApiKey } from "./keys";
import type { Operation } from "./operations";
import type { ApiActor } from "./service";

/**
 * Exécution commune aux routes REST et au serveur MCP : clé, limites de
 * débit, validation, idempotence et erreurs lisibles par un agent.
 */

export type Outcome = { status: number; body: unknown; replayed?: boolean };

export function errorBody(error: ApiError) {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  };
}

function fail(error: ApiError): Outcome {
  return { status: error.status, body: errorBody(error) };
}

export type Auth =
  | { kind: "anonymous" }
  | { kind: "key"; actor: ApiActor }
  | { kind: "error"; outcome: Outcome };

export async function authenticate(headers: Headers, ip: string): Promise<Auth> {
  const key = readApiKey(headers);
  if (!key) return { kind: "anonymous" };

  const refused = (): Auth => {
    if (!consume(`api:authfail:${ip}`, 20, 60_000)) {
      return { kind: "error", outcome: fail(new ApiError(429, "rate_limited", "Too many invalid API keys. Wait a minute.")) };
    }
    return {
      kind: "error",
      outcome: fail(
        new ApiError(401, "invalid_api_key", "Invalid or revoked API key. Organizers create keys in the ticketick admin, under « API & agents IA »."),
      ),
    };
  };
  if (!isApiKeyShape(key)) return refused();

  const row = await prisma.apiKey.findUnique({
    where: { hash: hashApiKey(key) },
    include: { organizer: { select: { id: true, name: true, slug: true } } },
  });
  if (!row || row.revokedAt) return refused();

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    void prisma.apiKey
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  return {
    kind: "key",
    actor: {
      keyId: row.id,
      keyName: row.name,
      keyPrefix: row.prefix,
      canPublish: row.canPublish,
      organizerId: row.organizer.id,
      organizerName: row.organizer.name,
      organizerSlug: row.organizer.slug,
    },
  };
}

// ─────────────────────────────── Idempotence

const IDEMPOTENCY_TTL_MS = 7 * 24 * 3600_000;
const ABANDONED_MS = 5 * 60_000;

async function claim(actor: ApiActor, key: string, operation: string): Promise<Outcome | null> {
  if (Math.random() < 0.02) {
    void prisma.apiIdempotency
      .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } } })
      .catch(() => undefined);
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await prisma.apiIdempotency.create({ data: { apiKeyId: actor.keyId, key, operation } });
      return null;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
    const row = await prisma.apiIdempotency.findUnique({
      where: { apiKeyId_key: { apiKeyId: actor.keyId, key } },
    });
    if (!row) continue;
    if (row.operation !== operation) {
      return fail(new ApiError(422, "idempotency_key_reused", "This idempotency key was already used for another operation."));
    }
    if (row.status === 0) {
      if (Date.now() - row.createdAt.getTime() < ABANDONED_MS) {
        return fail(new ApiError(409, "request_in_progress", "A request with this idempotency key is still running. Retry in a few seconds."));
      }
      await prisma.apiIdempotency.delete({ where: { id: row.id } }).catch(() => undefined);
      continue;
    }
    return { status: row.status, body: row.response, replayed: true };
  }
  return fail(new ApiError(409, "request_in_progress", "Retry in a few seconds."));
}

async function settle(actor: ApiActor, key: string, outcome: Outcome | null) {
  const where = { apiKeyId_key: { apiKeyId: actor.keyId, key } };
  if (!outcome) {
    // Échec : la même clé pourra resservir une fois la requête corrigée.
    await prisma.apiIdempotency.delete({ where }).catch(() => undefined);
    return;
  }
  await prisma.apiIdempotency
    .update({ where, data: { status: outcome.status, response: outcome.body as Prisma.InputJsonValue } })
    .catch(() => undefined);
}

// ─────────────────────────────── Exécution

export async function execute(
  op: Operation,
  actor: ApiActor | null,
  raw: unknown,
  options: { ip: string; idempotencyKey?: string | null },
): Promise<Outcome> {
  if (op.auth === "key" && !actor) {
    return fail(
      new ApiError(
        401,
        "api_key_required",
        `${op.name} needs an organizer API key (Authorization: Bearer tt_…). Organizers create keys in the ticketick admin, under « API & agents IA ». Docs: https://ticketick.ch/developers`,
      ),
    );
  }
  const allowed = actor
    ? consume(`api:key:${actor.keyId}`, 120, 60_000)
    : consume(`api:public:${options.ip}`, 60, 60_000);
  if (!allowed) return fail(new ApiError(429, "rate_limited", "Rate limit reached. Wait a minute."));

  const parsed = op.input.safeParse(raw ?? {});
  if (!parsed.success) {
    return fail(new ApiError(400, "invalid_request", "Some fields are invalid.", { issues: describeIssues(parsed.error) }));
  }
  const data = parsed.data as Record<string, unknown>;
  const fromBody = typeof data.idempotencyKey === "string" ? data.idempotencyKey : null;
  const idempotencyKey = op.creates && actor ? (options.idempotencyKey?.slice(0, 100) || fromBody) : null;

  if (idempotencyKey && actor) {
    const replay = await claim(actor, idempotencyKey, op.name);
    if (replay) return replay;
  }

  let outcome: Outcome | null = null;
  try {
    const result = await op.run(actor, parsed.data);
    outcome = { status: op.creates ? 201 : 200, body: result };
    return outcome;
  } catch (error) {
    if (error instanceof ApiError) return fail(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail(new ApiError(409, "conflict", "This value is already used (e.g. slug). Change it and retry."));
    }
    console.error("[api] erreur", op.name, error instanceof Error ? error.message : "inconnue");
    return fail(new ApiError(500, "server_error", "Unexpected error. Check with list_events before retrying a creation, or send an idempotencyKey."));
  } finally {
    if (idempotencyKey && actor) await settle(actor, idempotencyKey, outcome);
  }
}
