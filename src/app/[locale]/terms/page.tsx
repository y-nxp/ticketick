import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { LegalPage } from "@/components/layout/legal-page";
import { legalLocale, termsCopy } from "@/lib/legal/copy";
import { pageAlternates } from "@/lib/seo/site";

const titles: Record<string, string> = {
  fr: "Conditions générales",
  en: "Terms & conditions",
  de: "AGB",
  it: "Termini e condizioni",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: titles[legalLocale(locale)], alternates: pageAlternates("/terms", locale) };
}

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <LegalPage
      title={titles[legalLocale(locale)]}
      doc={termsCopy(locale)}
    />
  );
}
