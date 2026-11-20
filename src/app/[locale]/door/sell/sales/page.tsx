import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { CancelSale } from "@/components/door/cancel-sale";
import { Link, redirect } from "@/i18n/navigation";
import { requireRole } from "@/lib/auth/dal";
import { bucketOf, getSaleSession, getSessionSales } from "@/lib/door/sale";
import { canManageTill, canScan, DOOR_ROLES } from "@/lib/door/scope";
import { cn, EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";
import { DoorHeader } from "../../door-header";
import { BUCKET_LABEL } from "../till-totals";

export const dynamic = "force-dynamic";

/** Ventes du soir d'un concert, pour le responsable de caisse : il peut en annuler. */
export default async function DoorSalesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const user = await requireRole(DOOR_ROLES, "/door/sell");
  if (!canManageTill(user)) redirect({ href: "/door/sell", locale });
  const { s } = await searchParams;
  if (!s) notFound();
  const [session, sales] = await Promise.all([getSaleSession(user, s, locale), getSessionSales(user, s)]);
  if (!sales) notFound();
  const t = await getTranslations("door.sell");
  const intl = `${locale}-CH`;
  const time = (d: Date, withDay = false) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: EVENT_TIME_ZONE,
      ...(withDay ? { day: "2-digit", month: "2-digit" } : {}),
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  const method = (provider: string) => {
    const bucket = bucketOf(provider);
    if (!bucket) return t("free");
    const { method: m, mode } = BUCKET_LABEL[bucket];
    return mode ? `${t(m)} · ${t(mode)}` : t(m);
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <DoorHeader active="sell" till={canScan(user)} />
      <div className="mx-auto w-full max-w-lg flex-1 space-y-4 px-4 py-5">
        <Link
          href={{ pathname: "/door/sell", query: { s } }}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
          {session?.title ?? t("otherConcert")}
        </Link>
        <h2 className="text-xl font-bold tracking-tight">{t("cancel.salesTitle")}</h2>
        {sales.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("cancel.noSales")}</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border bg-card">
            {sales.map((sale) => (
              <li key={sale.id} className={cn("space-y-1.5 px-4 py-3", sale.cancelledAt && "bg-muted/40")}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-sm", sale.cancelledAt && "line-through text-muted-foreground")}>
                    <span className="tabular-nums">{time(sale.at)}</span> · {method(sale.provider)} · {sale.seller}
                  </span>
                  <span className={cn("font-semibold tabular-nums", sale.cancelledAt && "line-through text-muted-foreground")}>
                    {formatPrice(sale.amountCents, intl)}
                  </span>
                </div>
                <p className={cn("text-sm text-muted-foreground", sale.cancelledAt && "line-through")}>
                  {sale.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ")}
                </p>
                {sale.cancelledAt ? (
                  <p className="text-xs text-destructive">
                    {t("cancel.cancelledBy", { date: time(sale.cancelledAt, true), who: sale.cancelledBy ?? "—" })}
                    {sale.cancelReason ? ` · ${sale.cancelReason}` : ""}
                  </p>
                ) : (
                  <CancelSale saleId={sale.id} provider={sale.provider} compact />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
