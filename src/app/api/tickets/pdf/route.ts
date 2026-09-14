import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import {
  ticketPdfTokenOk,
  ticketsPdfBuffer,
} from "@/lib/tickets/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("ref")?.trim() ?? "";
  const token = url.searchParams.get("t")?.trim() ?? "";
  if (!reference) {
    return NextResponse.json({ error: "missing_ref" }, { status: 400 });
  }

  const allowed = ticketPdfTokenOk(reference, token) || (await ownsOrder(reference));
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const pdf = await ticketsPdfBuffer(reference);
  if (!pdf) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const filename = `billets-${reference}.pdf`;
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

async function ownsOrder(reference: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  const order = await prisma.order.findUnique({
    where: { reference },
    select: { userId: true, email: true, status: true },
  });
  if (!order || order.status !== "PAID") return false;
  return order.userId === user.id || order.email === user.email;
}
