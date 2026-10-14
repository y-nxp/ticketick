import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, CheckCircle2, FileDown, Printer } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CartClearer } from "@/components/cart/cart-clearer";
import { isRefundDue } from "@/lib/orders/reservation";
import { settlePostfinanceOrder, settleStripeOrder } from "@/lib/orders/settle-card";
import { prisma } from "@/lib/prisma";
import { parseGoOrigin, SHOP_ORIGIN_COOKIE } from "@/lib/shop-origin";
import { ticketPdfPath } from "@/lib/tickets/download";
import { getCurrentUser } from "@/lib/auth/dal";
import { AccountInvite } from "@/components/checkout/account-invite";
import { PurchaseTracker } from "@/components/analytics/trackers";
import { CONSENT_COOKIE, parseConsent } from "@/lib/analytics/consent";
import { sendMetaPurchase } from "@/lib/analytics/meta-capi";
import { organizerTagsFromRow } from "@/lib/analytics/organizer-tags";
import { publicAppOrigin } from "@/lib/app-url";
import { clientIpFrom } from "@/lib/rate-limit";
import { t as tr, type Translated } from "@/lib/types";

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
    await settleStripeOrder(ref).catch((error) => {
      console.error("[checkout/success] confirmation Stripe", error);
    });
  }

  const paid = ref
    ? await prisma.order.findUnique({
        where: { reference: ref },
        select: {
          status: true,
          paymentMethod: true,
          totalCents: true,
          currency: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          payment: { select: { status: true } },
          _count: { select: { tickets: true } },
          items: {
            select: {
              ticketTypeId: true,
              quantity: true,
              unitPriceCents: true,
              ticketType: {
                select: {
                  name: true,
                  session: {
                    select: {
                      event: {
                        select: {
                          title: true,
                          organizer: { select: { metaPixelId: true, ga4MeasurementId: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    : null;
  const refundDue = paid ? isRefundDue(paid) : false;
  const cookieStore = await cookies();

  const purchase =
    ref && paid?.status === "PAID" && !refundDue
      ? {
          reference: ref,
          valueCents: paid.totalCents,
          currency: paid.currency,
          paymentType: paid.paymentMethod,
          items: paid.items.map((i) => ({
            id: i.ticketTypeId,
            name: `${tr(i.ticketType.session.event.title as Translated, "fr")} — ${tr(i.ticketType.name as Translated, "fr")}`,
            priceCents: i.unitPriceCents,
            quantity: i.quantity,
            organizer: organizerTagsFromRow(i.ticketType.session.event.organizer),
          })),
        }
      : null;

  if (purchase && paid && parseConsent(cookieStore.get(CONSENT_COOKIE)?.value) === "granted") {
    const requestHeaders = await headers();
    const ip = clientIpFrom(requestHeaders);
    const buyer = {
      email: paid.email,
      phone: paid.phone,
      firstName: paid.firstName,
      lastName: paid.lastName,
      ip: ip === "inconnue" ? null : ip,
      userAgent: requestHeaders.get("user-agent"),
      fbp: cookieStore.get("_fbp")?.value ?? null,
      fbc: cookieStore.get("_fbc")?.value ?? null,
    };
    after(() =>
      sendMetaPurchase({
        ...purchase,
        ...buyer,
        sourceUrl: `${publicAppOrigin()}/${locale}/checkout/success`,
      }),
    );
  }
  const pdfHref =
    ref && paid?.status === "PAID" && paid._count.tickets > 0
      ? ticketPdfPath(ref)
      : null;
  const origin = parseGoOrigin(cookieStore.get(SHOP_ORIGIN_COOKIE)?.value);
  const shopHome = origin ? `/go/${origin.orgSlug}` : "/";
  const signedIn = Boolean(await getCurrentUser());

  return (
    <div className="container-page max-w-2xl py-20 text-center">
      <CartClearer />
      {purchase ? <PurchaseTracker {...purchase} /> : null}
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
      {ref && !refundDue && !signedIn ? <AccountInvite /> : null}
    </div>
  );
}
