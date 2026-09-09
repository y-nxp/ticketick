import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowRight,
  BarChart3,
  Ticket,
  Banknote,
  CalendarPlus,
  Users,
  MapPin,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("organizer");

  return (
    <div className="container-page py-12">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium">
            {t("title")}
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">
            {t("hero")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            {t("heroSubtitle")}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/organizer/dashboard">
              <Button size="lg">
                {t("cta")}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/organizer/dashboard">
              <Button size="lg" variant="outline">
                <CalendarPlus className="size-4" />
                {t("createEvent")}
              </Button>
            </Link>
          </div>
        </div>

        {/* Aperçu tableau de bord */}
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">
            {t("dashboard")}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Stat
              icon={<Ticket className="size-5 text-primary" />}
              label={t("ticketsSold")}
              value="4 812"
            />
            <Stat
              icon={<Banknote className="size-5 text-primary" />}
              label={t("revenue")}
              value={formatPrice(48120000, `${locale}-CH`)}
            />
            <Stat
              icon={<Users className="size-5 text-primary" />}
              label={t("sales")}
              value="1 204"
            />
            <Stat
              icon={<BarChart3 className="size-5 text-primary" />}
              label={t("events")}
              value="12"
            />
          </div>
        </div>
      </div>

      {/* Fonctionnalités */}
      <div className="mt-16 grid gap-5 sm:grid-cols-3">
        <Feature
          icon={<CalendarPlus className="size-5" />}
          title={t("createEvent")}
          text={
            locale === "fr"
              ? "Créez un événement avec plusieurs catégories, types de billets et dates."
              : locale === "de"
                ? "Erstellen Sie eine Veranstaltung mit mehreren Kategorien und Ticketarten."
                : locale === "it"
                  ? "Crea un evento con più categorie e tipi di biglietto."
                  : "Create an event with multiple categories and ticket types."
          }
        />
        <Feature
          icon={<MapPin className="size-5" />}
          title={t("dashboard")}
          text={
            locale === "fr"
              ? "Ajoutez un plan de salle optionnel et gérez le placement."
              : locale === "de"
                ? "Fügen Sie optional einen Saalplan hinzu und verwalten Sie die Platzierung."
                : locale === "it"
                  ? "Aggiungi una mappa dei posti opzionale e gestisci la disposizione."
                  : "Add an optional seating map and manage placement."
          }
        />
        <Feature
          icon={<BarChart3 className="size-5" />}
          title={t("sales")}
          text={
            locale === "fr"
              ? "Suivez vos ventes et revenus en temps réel, encaissez par carte ou IBAN."
              : locale === "de"
                ? "Verfolgen Sie Verkäufe und Einnahmen in Echtzeit, per Karte oder IBAN."
                : locale === "it"
                  ? "Monitora vendite e ricavi in tempo reale, incassa con carta o IBAN."
                  : "Track sales and revenue in real time, collect by card or IBAN."
          }
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="mt-4 font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
