import { getTranslations, setRequestLocale } from "next-intl/server";
import { Smartphone, Ticket, Bell, Wallet, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function FriendsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("friends");

  const features = {
    fr: [
      { t: "Vos billets", d: "Tous vos billets dans votre poche, hors ligne." },
      { t: "Notifications", d: "Rappels d'événements et infos de dernière minute." },
      { t: "Prochains achats", d: "Accès prioritaire et paiement en un clic." },
    ],
    en: [
      { t: "Your tickets", d: "All your tickets in your pocket, offline." },
      { t: "Notifications", d: "Event reminders and last-minute info." },
      { t: "Next purchases", d: "Priority access and one-click checkout." },
    ],
    de: [
      { t: "Ihre Tickets", d: "Alle Tickets in Ihrer Tasche, offline." },
      { t: "Benachrichtigungen", d: "Erinnerungen und Last-Minute-Infos." },
      { t: "Nächste Käufe", d: "Prioritärer Zugang und 1-Klick-Kauf." },
    ],
    it: [
      { t: "I tuoi biglietti", d: "Tutti i biglietti in tasca, offline." },
      { t: "Notifiche", d: "Promemoria eventi e info dell'ultimo minuto." },
      { t: "Prossimi acquisti", d: "Accesso prioritario e acquisto in un clic." },
    ],
  } as const;

  const list = features[locale as keyof typeof features] ?? features.fr;
  const icons = [Ticket, Bell, Wallet];

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10">
          <Smartphone className="size-8 text-primary" />
        </div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{t("subtitle")}</p>
        <Button size="lg" className="mt-6">
          <Download className="size-4" />
          {t("install")}
        </Button>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
        {list.map((f, i) => {
          const Icon = icons[i];
          return (
            <div key={i} className="rounded-2xl border border-border bg-card p-6">
              <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
