import { NextResponse } from "next/server";

// Sonde de démarrage utilisée par le déploiement gb10.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "ticketick",
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
