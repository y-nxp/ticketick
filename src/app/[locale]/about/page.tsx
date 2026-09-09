import { setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/layout/content-page";

const titles: Record<string, string> = {
  fr: "À propos",
  en: "About",
  de: "Über uns",
  it: "Chi siamo",
};

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <ContentPage title={titles[locale] ?? titles.fr}>
      <p>
        ticketick est la billetterie suisse moderne pour les concerts, le
        théâtre, les festivals et bien plus. Basée en Suisse, disponible en
        français, anglais, allemand et italien.
      </p>
    </ContentPage>
  );
}
