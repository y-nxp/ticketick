import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { TriangleAlert, XCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { readCollectReturn } from "@/lib/door/collect-link";
import { completeDoorSale } from "@/lib/door/sale";
import { DoorHeader } from "../../../door-header";
import { SaleSummary } from "../../sale-summary";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false } };

/**
 * Retour de Collect après l'encaissement. Pas de connexion exigée : le
 * navigateur ouvert par Collect n'est pas toujours celui de l'app. La vente
 * signée et le paiement vérifié chez Stripe suffisent.
 */
export default async function DoorSaleDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("door.sell");
  const outcome = await completeDoorSale(token, readCollectReturn(await searchParams));

  return (
    <div className="flex min-h-dvh flex-col">
      <DoorHeader active="sell" till />
      <div className="mx-auto w-full max-w-lg flex-1 px-4 py-5">
        {outcome.status === "done" ? (
          <SaleSummary orderId={outcome.orderId} locale={locale} again={outcome.again} />
        ) : (
          <div className="space-y-5">
            <div className="rounded-card border border-border bg-card p-5 text-center">
              {outcome.status === "cancelled" ? (
                <XCircle className="mx-auto size-10 text-muted-foreground" />
              ) : (
                <TriangleAlert className="mx-auto size-10 text-destructive" />
              )}
              <p className="mt-2 text-lg font-semibold">
                {outcome.status === "cancelled"
                  ? t("cancelled")
                  : outcome.status === "refunded"
                    ? t("refunded")
                    : t("failed")}
              </p>
              {outcome.status !== "cancelled" ? (
                <p className="mt-1 text-sm text-muted-foreground">{t(`errors.${outcome.error}`)}</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">{t("cancelledHint")}</p>
              )}
            </div>
            <Link
              href="/door/sell"
              className="flex h-14 items-center justify-center rounded-control bg-primary text-base font-medium text-primary-foreground"
            >
              {t("backToSell")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
