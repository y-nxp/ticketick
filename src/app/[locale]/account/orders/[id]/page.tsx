import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { ChangeScreen } from "@/components/change/change-screen";
import { Link, redirect } from "@/i18n/navigation";
import { requireAuth } from "@/lib/auth/dal";
import { intlLocale } from "@/lib/i18n-fallback";
import { cancellableTickets } from "@/lib/orders/exchange";
import { changePageData } from "@/lib/orders/seat-change";
import { t as translate } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { FreeCancelPanel } from "./free-cancel-panel";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const user = await requireAuth(`/account/orders/${id}`);
  const t = await getTranslations("account.manage");
  const data = await changePageData({ userId: user.id, orderId: id });
  // Commande entièrement annulée depuis cette page, ou d'un autre compte.
  if (data.state !== "open") return redirect({ href: "/account", locale });
  const fmt = intlLocale(locale);
  const cancellable = await cancellableTickets(id);

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/account"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
        <h1 className="mt-4 text-3xl">{t("title")}</h1>

        {cancellable.length > 0 ? (
          <div className="mt-6">
            <FreeCancelPanel
              orderId={id}
              tickets={cancellable.map((ticket) => ({
                id: ticket.id,
                title: translate(ticket.eventTitle, locale),
                when: formatDate(ticket.startsAt, fmt, { weekday: "long" }),
                tariffName: translate(ticket.tariffName, locale),
                seatLabel: ticket.seatLabel,
                until: formatDate(ticket.cancelUntil, fmt, { weekday: "long" }),
              }))}
            />
          </div>
        ) : null}

        <ChangeScreen data={data} access={{ orderId: id }} locale={locale} />
      </div>
    </div>
  );
}
