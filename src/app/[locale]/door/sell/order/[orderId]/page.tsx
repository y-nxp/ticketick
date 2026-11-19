import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/dal";
import { doorEventWhere, DOOR_ROLES } from "@/lib/door/scope";
import { prisma } from "@/lib/prisma";
import { DoorHeader } from "../../../door-header";
import { SaleSummary } from "../../sale-summary";

export const dynamic = "force-dynamic";

/** Vente gratuite enregistrée depuis la caisse, sans passer par Collect. */
export default async function DoorSaleOrderPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  setRequestLocale(locale);
  const user = await requireRole(DOOR_ROLES, "/door/sell");
  const allowed = await prisma.order.count({
    where: {
      id: orderId,
      channel: "BOX_OFFICE",
      tickets: { some: { ticketType: { session: { event: doorEventWhere(user) } } } },
    },
  });
  if (allowed === 0) notFound();
  return (
    <div className="flex min-h-dvh flex-col">
      <DoorHeader active="sell" />
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-5">
        <SaleSummary orderId={orderId} locale={locale} />
      </div>
    </div>
  );
}
