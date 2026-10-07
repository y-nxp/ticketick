import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { requireResellerAgent } from "@/lib/auth/dal";
import { getPosSale } from "@/lib/resellers/data";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate, formatPrice } from "@/lib/utils";
import { PayLinkPanel } from "./pay-link-panel";

export const dynamic = "force-dynamic";

export default async function PosSalePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const agent = await requireResellerAgent(`/pos/sales/${id}`);
  const t = await getTranslations("pos.sales");
  const sale = await getPosSale(agent, id);
  if (!sale) notFound();
  const money = (cents: number) => formatPrice(cents, `${locale}-CH`);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/pos/sales" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 font-mono text-2xl">{sale.reference}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {sale.eventTitle ? translate(sale.eventTitle as Translated, locale) : null}
          {sale.startsAt ? ` · ${formatDate(sale.startsAt, `${locale}-CH`)}` : null}
        </p>
      </header>

      <section className="grid gap-4 rounded-card border border-border bg-card p-6 text-sm sm:grid-cols-2">
        <p>
          <span className="block text-xs text-muted-foreground">{t("method")}</span>
          {t(`methods.${sale.method}`)}{" "}
          <Badge variant={sale.state === "paid" ? "success" : sale.state === "pending" ? "default" : "outline"}>
            {t(`states.${sale.state}`)}
          </Badge>
        </p>
        <p>
          <span className="block text-xs text-muted-foreground">{t("amount")}</span>
          <span className="tabular-nums">{money(sale.amountCents)}</span>
          {" · "}
          {t("commissionOf", { amount: money(sale.commissionCents) })}
        </p>
        <p>
          <span className="block text-xs text-muted-foreground">{t("buyer")}</span>
          {[sale.holder, sale.email, sale.phone].filter(Boolean).join(" · ") || t("anonymous")}
        </p>
        <p>
          <span className="block text-xs text-muted-foreground">{t("soldAt")}</span>
          {formatDate(sale.createdAt, `${locale}-CH`)}
          {sale.seller ? ` · ${sale.seller}` : null}
        </p>
      </section>

      {sale.state === "pending" ? <PayLinkPanel orderId={sale.id} /> : null}

      <section className="rounded-card border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg">{t("ticketsTitle", { count: sale.tickets.length })}</h2>
          {sale.pdfUrl ? (
            <a href={sale.pdfUrl} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Download className="size-4" />
              {t("download")}
            </a>
          ) : null}
        </div>
        <ul className="mt-3 divide-y divide-border text-sm">
          {sale.tickets.map((ticket) => (
            <li key={ticket.code} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <span className="font-mono text-xs">{ticket.code}</span>
              <span className="min-w-0 flex-1">
                {translate(ticket.ticketType.name as Translated, locale)}
                {ticket.seatLabel ? ` · ${ticket.seatLabel}` : null}
                {ticket.attendeeName ? ` · ${ticket.attendeeName}` : null}
              </span>
              <span className="tabular-nums">{money(ticket.ticketType.priceCents)}</span>
              <Badge variant="outline">{t(`ticketStatus.${ticket.status}`)}</Badge>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
