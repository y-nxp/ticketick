import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/dal";
import { canManageTill, canScan, canUseTill, DOOR_ROLES, tillEventWhere } from "@/lib/door/scope";
import { prisma } from "@/lib/prisma";
import { DoorHeader } from "../../../door-header";
import { SaleSummary } from "../../sale-summary";
import { TillNotice } from "../../till-notice";

export const dynamic = "force-dynamic";

/** Vente gratuite comptée depuis la caisse, sans passer par Collect. */
export default async function DoorSalePage({
  params,
}: {
  params: Promise<{ locale: string; saleId: string }>;
}) {
  const { locale, saleId } = await params;
  setRequestLocale(locale);
  const user = await requireRole(DOOR_ROLES, "/door/sell");
  if (!canUseTill(user)) redirect({ href: "/door", locale });
  const allowed = await prisma.doorSale.count({
    where: { id: saleId, session: { event: tillEventWhere(user) } },
  });
  if (allowed === 0) notFound();
  return (
    <div className="flex min-h-dvh flex-col">
      <DoorHeader active="sell" till={canScan(user)} />
      <div className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5">
        <TillNotice />
        <SaleSummary saleId={saleId} locale={locale} canCancel={canManageTill(user)} />
      </div>
    </div>
  );
}
