import { getTranslations, setRequestLocale } from "next-intl/server";
import { Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPaypalSettings } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";
import { OrganizerPicker } from "../team/team-forms";
import { PaypalForm } from "./paypal-form";

export const dynamic = "force-dynamic";

export default async function AdminPaypalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ o?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { o } = await searchParams;

  const settings = await getPaypalSettings(o);
  const t = await getTranslations("admin.paypal");
  const account = settings.account;

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>

      {settings.organizers.length > 0 ? (
        <OrganizerPicker
          organizers={settings.organizers}
          value={settings.organizerId ?? ""}
          pathname="/admin/paypal"
        />
      ) : null}

      {settings.organizerId ? (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Wallet className="size-5 text-primary" />
              {t("account")}
            </h2>
            {account ? (
              <div className="flex gap-2">
                <Badge variant={account.enabled ? "default" : "secondary"}>
                  {t(account.enabled ? "enabled" : "disabled")}
                </Badge>
                <Badge variant="outline">{t(account.live ? "live" : "sandbox")}</Badge>
              </div>
            ) : (
              <Badge variant="secondary">{t("none")}</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
          {account ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("updated", {
                date: formatDate(account.updatedAt, `${locale}-CH`),
              })}
            </p>
          ) : null}
          <PaypalForm
            key={settings.organizerId}
            organizerId={settings.organizerId}
            account={
              account
                ? {
                    payeeEmail: account.payeeEmail,
                    clientId: account.clientId,
                    live: account.live,
                    enabled: account.enabled,
                  }
                : null
            }
          />
        </section>
      ) : null}
    </div>
  );
}
