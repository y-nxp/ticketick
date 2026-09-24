import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { ensureTicketsForReference } from "@/lib/tickets/issue";
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

  const staff = await staffCanDownload(reference);
  const allowed =
    staff || ticketPdfTokenOk(reference, token) || (await ownsOrder(reference));
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (staff) {
    await ensureTicketsForReference(reference);
  }

  const pdf = await ticketsPdfBuffer(reference, { requirePaid: !staff });
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
  // L'adresse ne vaut preuve qu'une fois confirmée : sinon, s'inscrire avec
  // l'e-mail d'un acheteur ouvrirait ses billets.
  return (
    order.userId === user.id ||
    (user.emailVerified && order.email === user.email)
  );
}

async function staffCanDownload(reference: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "ORGANIZER")) {
    return false;
  }
  const order = await prisma.order.findUnique({
    where: { reference },
    select: {
      items: {
        select: {
          ticketType: {
            select: {
              session: { select: { event: { select: { organizerId: true } } } },
            },
          },
        },
      },
    },
  });
  if (!order || order.items.length === 0) return false;
  if (user.role === "ADMIN") return true;
  return order.items.some(
    (item) =>
      item.ticketType.session.event.organizerId === user.organizerId,
  );
}
