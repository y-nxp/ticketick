import "server-only";

import { NextResponse } from "next/server";
import { publicAppOrigin } from "@/lib/app-url";
import { clientIpFrom } from "@/lib/rate-limit";
import { ApiError } from "./errors";
import { buildOpenApi } from "./openapi";
import { matchOperation } from "./operations";
import { authenticate, errorBody, execute } from "./runtime";

/**
 * Routes REST `/api/v1/*`. Pas de cookie : seule la clé de l'en-tête
 * compte, d'où l'ouverture CORS sans risque pour les sessions du site.
 */

export const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers":
    "authorization, x-api-key, content-type, idempotency-key, mcp-protocol-version, mcp-session-id",
  "access-control-max-age": "86400",
};

const MAX_BODY = 1_000_000;

export function apiJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS_HEADERS, "cache-control": "no-store", ...extra },
  });
}

function apiError(error: ApiError, extra: Record<string, string> = {}) {
  return apiJson(errorBody(error), error.status, extra);
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function handleRest(request: Request, segments: string[]): Promise<Response> {
  const path = `/${segments.join("/")}`;
  const url = new URL(request.url);

  if (path === "/openapi.json" && request.method === "GET") {
    return apiJson(buildOpenApi(publicAppOrigin(request)), 200, { "cache-control": "public, max-age=3600" });
  }

  const match = matchOperation(request.method, path);
  if (!match) {
    return apiError(new ApiError(404, "not_found", "Unknown endpoint. See /api/v1/openapi.json"));
  }
  if ("allowed" in match) {
    return apiError(new ApiError(405, "method_not_allowed", `Use ${match.allowed.join(" or ")}.`), {
      allow: match.allowed.join(", "),
    });
  }

  const ip = clientIpFrom(request.headers);
  const auth = await authenticate(request.headers, ip);
  if (auth.kind === "error") return apiJson(auth.outcome.body, auth.outcome.status);

  let body: Record<string, unknown> = {};
  if (request.method === "POST" || request.method === "PATCH") {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return apiError(new ApiError(413, "too_large", "Request body over 1 MB."));
    if (raw.trim()) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("object");
        body = parsed as Record<string, unknown>;
      } catch {
        return apiError(new ApiError(400, "invalid_json", "The body must be a JSON object."));
      }
    }
  }

  const query = Object.fromEntries(url.searchParams.entries());
  const input = request.method === "GET" || request.method === "DELETE"
    ? { ...query, ...match.params }
    : { ...body, ...match.params };

  const outcome = await execute(match.op, auth.kind === "key" ? auth.actor : null, input, {
    ip,
    idempotencyKey: request.headers.get("idempotency-key"),
  });
  return apiJson(outcome.body, outcome.status, outcome.replayed ? { "idempotent-replayed": "true" } : {});
}
