import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, CheckCircle2, FileDown, Printer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CartClearer } from "@/components/cart/cart-clearer";
import { isRefundDue } from "@/lib/orders/reservation";
import { settlePostfinanceOrder } from "@/lib/orders/settle-card";
import { prisma } from "@/lib/prisma";
import { parseGoOrigin, SHOP_ORIGIN_COOKIE } from "@/lib/shop-origin";
import { ticketPdfPath } from "@/lib/tickets/download";

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { locale } = await params;
  const { ref } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("checkout");

  if (ref) {
    await settlePostfinanceOrder(ref).catch((error) => {
      console.error("[checkout/success] confirmation PostFinance", error);
    });
  }

  const paid = ref
    ? await prisma.order.findUnique({
        where: { reference: ref },
        select: {
          status: true,
          payment: { select: { status: true } },
          _count: { select: { tickets: true } },
        },
      })
    : null;
  const refundDue = paid ? isRefundDue(paid) : false;
  const pdfHref =
    ref && paid?.status === "PAID" && paid._count.tickets > 0
      ? ticketPdfPath(ref)
      : null;
  const shopHome =
    parseGoOrigin((await cookies()).get(SHOP_ORIGIN_COOKIE)?.value)?.path ??
    "/";

  return (
    <div className="container-page max-w-2xl py-20 text-center">
      <CartClearer />
      {refundDue ? (
        <>
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--warning)]/12">
            <AlertTriangle className="size-8 text-[var(--warning)]" />
          </div>
          <h1 className="mt-6 text-3xl font-bold">{t("paidTooLateTitle")}</h1>
          <p className="mt-4 text-muted-foreground">{t("paidTooLate")}</p>
        </>
      ) : (
        <>
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--success)]/12">
            <CheckCircle2 className="size-8 text-[var(--success)]" />
          </div>
          <h1 className="mt-6 text-3xl font-bold">{t("success")}</h1>
        </>
      )}
      {ref && (
        <p className="mt-4 font-mono text-sm text-muted-foreground">
          Réf. {ref}
        </p>
      )}
      {pdfHref ? (
        <div className="mt-8 space-y-3">
          <p className="text-sm text-muted-foreground">{t("pdfHint")}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <a href={pdfHref} target="_blank" rel="noreferrer">
              <Button size="lg">
                <FileDown className="size-4" />
                {t("downloadPdf")}
              </Button>
            </a>
            <a href={pdfHref} target="_blank" rel="noreferrer">
              <Button size="lg" variant="outline">
                <Printer className="size-4" />
                {t("printTickets")}
              </Button>
            </a>
          </div>
        </div>
      ) : null}
      <Link href={shopHome} className="mt-6 inline-block">
        <Button size="lg" variant={pdfHref ? "outline" : "default"}>
          {t("backHome")}
        </Button>
      </Link>
    </div>
  );
}
