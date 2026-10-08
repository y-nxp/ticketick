import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";
import { consume } from "@/lib/rate-limit";
import { checkPartnerSignature, partnerLocale, type PartnerLocale } from "./core";

/**
 * Enveloppe des routes `/api/partner/v1` : signature HMAC de Clouboard
 * (`PARTNER_API_SECRET`), organisateur et langue lus dans l'URL.
 */

export type PartnerContext = {
  organizerId: string | null;
  locale: PartnerLocale;
  body: unknown;
  url: URL;
};

const organizerParam = z.string().regex(/^[a-z0-9]{10,40}$/);

export function partnerRoute(
  handler: (ctx: PartnerContext) => Promise<unknown>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url);
    const raw = request.method === "GET" ? "" : await request.text();
    const check = checkPartnerSignature({
      secret: process.env.PARTNER_API_SECRET,
      timestamp: request.headers.get("x-partner-timestamp"),
      signature: request.headers.get("x-partner-signature"),
      method: request.method,
      path: `${url.pathname}${url.search}`,
      body: raw,
    });
    if (!check.ok) {
      return NextResponse.json({ error: "forbidden" }, { status: check.reason === "config" ? 503 : 403 });
    }
    if (!consume("partner-api", 600, 60_000)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const organizer = url.searchParams.get("organizer");
    if (organizer && !organizerParam.safeParse(organizer).success) {
      return NextResponse.json({ error: "invalid_organizer" }, { status: 400 });
    }
    let body: unknown = null;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "invalid_json" }, { status: 400 });
      }
    }

    try {
      const result = await handler({
        organizerId: organizer || null,
        locale: partnerLocale(url.searchParams.get("locale")),
        body,
        url,
      });
      if (result instanceof Response) return result;
      return NextResponse.json(result);
    } catch (error) {
      console.error("[partner-api] erreur", url.pathname, error instanceof Error ? error.message : "inconnue");
      return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
  };
}

export function notFound() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export function badRequest(error = "invalid_request") {
  return NextResponse.json({ error }, { status: 400 });
}
