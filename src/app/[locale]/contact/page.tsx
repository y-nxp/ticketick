import { setRequestLocale } from "next-intl/server";
import { ContentPage } from "@/components/layout/content-page";

const titles: Record<string, string> = {
  fr: "Contact",
  en: "Contact",
  de: "Kontakt",
  it: "Contatto",
};

export default async function ContactPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <ContentPage title={titles[locale] ?? titles.fr}>
      <p>
        support@ticketick.ch — Lausanne, Suisse. Nous répondons du lundi au
        vendredi.
      </p>
    </ContentPage>
  );
}
