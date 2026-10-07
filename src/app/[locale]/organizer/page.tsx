import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { InquiryChat } from "./inquiry-chat";
import { pageAlternates } from "@/lib/seo/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "organizer" });
  const tm = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: tm("organizerDescription"),
    alternates: pageAlternates("/organizer", locale),
  };
}

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("organizer");

  return (
    <div className="container-page max-w-2xl py-12">
      <span className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium">
        {t("title")}
      </span>
      <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
        {t("hero")}
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">{t("heroSubtitle")}</p>

      <div className="mt-10 rounded-card border border-border bg-card p-6 shadow-sm sm:p-8">
        <InquiryChat />
      </div>
    </div>
  );
}
