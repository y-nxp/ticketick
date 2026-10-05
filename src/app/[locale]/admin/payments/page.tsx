import { getTranslations, setRequestLocale } from "next-intl/server";
import { CreditCard, Landmark, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { getPaymentSettings } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";
import { OrganizerPicker } from "../team/team-forms";
import { BankForm } from "./bank-form";
import { PaypalForm } from "./paypal-form";
import { PostfinanceForm } from "./postfinance-form";

export const dynamic = "force-dynamic";

export default async function AdminPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ o?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { o } = await searchParams;

  const settings = await getPaymentSettings(o);
  const t = await getTranslations("admin.payments");
  const tp = await getTranslations("admin.paypal");
  const { postfinance, paypal, bank, organizerId } = settings;
  const selected = settings.organizers.find((org) => org.id === organizerId);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      {settings.organizers.length > 0 ? (
        <div className="mt-6 overflow-x-auto rounded-card border border-border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-semibold">{t("organizer")}</th>
                <th className="px-4 py-3 font-semibold">{t("methods")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {settings.organizers.map((org) => (
                <tr key={org.id} className={org.id === organizerId ? "bg-muted/30" : undefined}>
                  <td className="px-4 py-3">
                    <Link
                      href={{ pathname: "/admin/payments", query: { o: org.id } }}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {org.card || org.paypal || org.iban ? (
                      <div className="flex flex-wrap gap-1.5">
                        {org.card ? <Badge variant="success">{t("card")}</Badge> : null}
                        {org.paypal ? <Badge variant="success">{t("paypal")}</Badge> : null}
                        {org.iban ? <Badge variant="success">{t("iban")}</Badge> : null}
                      </div>
                    ) : (
                      <Badge variant="secondary">{t("pending")}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {settings.organizers.length > 0 ? (
        <OrganizerPicker
          organizers={settings.organizers}
          value={organizerId ?? ""}
          pathname="/admin/payments"
        />
      ) : null}

      {organizerId && selected && !selected.card && !selected.paypal && !selected.iban ? (
        <p className="mt-4 rounded-control border border-border bg-muted/50 px-4 py-3 text-sm">
          {t("pendingHint")}
        </p>
      ) : null}

      {organizerId ? (
        <>
          <section className="mt-6 rounded-card border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <CreditCard className="size-5 text-primary" />
                {t("postfinance.title")}
              </h2>
              {postfinance ? (
                <Badge variant={postfinance.enabled ? "default" : "secondary"}>
                  {tp(postfinance.enabled ? "enabled" : "disabled")}
                </Badge>
              ) : (
                <Badge variant="secondary">{tp("none")}</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("postfinance.hint")}</p>
            {postfinance ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {tp("updated", { date: formatDate(postfinance.updatedAt, `${locale}-CH`) })}
              </p>
            ) : null}
            <PostfinanceForm
              key={organizerId}
              organizerId={organizerId}
              account={
                postfinance
                  ? {
                      spaceId: postfinance.spaceId,
                      userId: postfinance.userId,
                      spaceViewId: postfinance.spaceViewId,
                      enabled: postfinance.enabled,
                    }
                  : null
              }
            />
          </section>

          <section className="mt-6 rounded-card border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Wallet className="size-5 text-primary" />
                {t("paypal")}
              </h2>
              {paypal ? (
                <div className="flex gap-2">
                  <Badge variant={paypal.enabled ? "default" : "secondary"}>
                    {tp(paypal.enabled ? "enabled" : "disabled")}
                  </Badge>
                  <Badge variant="outline">{tp(paypal.live ? "live" : "sandbox")}</Badge>
                </div>
              ) : (
                <Badge variant="secondary">{tp("none")}</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{tp("hint")}</p>
            {paypal ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {tp("updated", { date: formatDate(paypal.updatedAt, `${locale}-CH`) })}
              </p>
            ) : null}
            <PaypalForm
              key={organizerId}
              organizerId={organizerId}
              account={
                paypal
                  ? {
                      payeeEmail: paypal.payeeEmail,
                      clientId: paypal.clientId,
                      live: paypal.live,
                      enabled: paypal.enabled,
                    }
                  : null
              }
            />
          </section>

          <section className="mt-6 rounded-card border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Landmark className="size-5 text-primary" />
                {t("bank.title")}
              </h2>
              <Badge variant={bank?.iban ? "default" : "secondary"}>
                {bank?.iban ? tp("enabled") : tp("none")}
              </Badge>
            </div>
            <BankForm
              key={organizerId}
              organizerId={organizerId}
              bank={bank ?? { iban: "", beneficiary: "" }}
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
