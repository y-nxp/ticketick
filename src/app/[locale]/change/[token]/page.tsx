import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { XCircle } from "lucide-react";
import { ChangeScreen } from "@/components/change/change-screen";
import { changePageData } from "@/lib/orders/seat-change";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const CONTACT = "ticket@ticketick.ch";

export default async function ChangePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("change");
  const data = await changePageData({ token });
  if (data.state === "invalid") notFound();

  if (data.state !== "open") {
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-xl rounded-card border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
            <XCircle className="size-7 text-muted-foreground" />
          </div>
          <h1 className="mt-4 text-2xl">{t("expiredTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("expiredText", { contact: CONTACT })}
          </p>
          <p className="mt-4 text-sm">
            <a
              href={`mailto:${CONTACT}?subject=${encodeURIComponent(data.reference)}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {CONTACT}
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl">{t("title")}</h1>
        <ChangeScreen data={data} access={{ token }} locale={locale} />
      </div>
    </div>
  );
}
