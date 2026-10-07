import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/layout/legal-page";
import { legalLocale, privacyCopy } from "@/lib/legal/copy";
import { pageAlternates } from "@/lib/seo/site";

const titles: Record<string, string> = {
  fr: "Confidentialité",
  en: "Privacy",
  de: "Datenschutz",
  it: "Privacy",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: titles[legalLocale(locale)], alternates: pageAlternates("/privacy", locale) };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <LegalPage
      title={titles[legalLocale(locale)]}
      doc={privacyCopy(locale)}
    />
  );
}
