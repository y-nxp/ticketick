import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

// Contrat de santé du socle NXP (y-nxp/socle, docs/sante.md) : healthcheck Docker, contrôle
// public après déploiement (version servie = commit déployé), surveillance du Cockpit.
export const dynamic = "force-dynamic";

export async function GET() {
  const version = process.env.APP_VERSION || null;
  let db: "ok" | "erreur" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "erreur";
  }
  return NextResponse.json(
    {
      ok: db === "ok",
      status: db === "ok" ? "ok" : "degraded",
      service: "ticketick",
      version,
      db,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    { status: db === "ok" ? 200 : 503 },
  );
}
