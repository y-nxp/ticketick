import { setRequestLocale } from "next-intl/server";
import { Search, ShoppingBag, CreditCard, Mail } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";

const content = {
  fr: {
    title: "Comment ça marche",
    subtitle: "Réservez vos billets en 4 étapes simples.",
    cta: "Découvrir les spectacles",
    steps: [
      { t: "Trouvez", d: "Parcourez les spectacles et filtrez par catégorie, ville ou date." },
      { t: "Choisissez", d: "Sélectionnez vos billets et ajoutez-les au panier." },
      { t: "Payez", d: "Réglez par carte (PostFinance Checkout) ou par virement IBAN." },
      { t: "Recevez", d: "Vos billets arrivent directement dans votre boîte e-mail." },
    ],
  },
  en: {
    title: "How it works",
    subtitle: "Book your tickets in 4 simple steps.",
    cta: "Explore events",
    steps: [
      { t: "Find", d: "Browse events and filter by category, city or date." },
      { t: "Choose", d: "Select your tickets and add them to the cart." },
      { t: "Pay", d: "Pay by card (PostFinance Checkout) or bank transfer (IBAN)." },
      { t: "Receive", d: "Your tickets arrive directly in your inbox." },
    ],
  },
  de: {
    title: "So funktioniert's",
    subtitle: "Buchen Sie Ihre Tickets in 4 einfachen Schritten.",
    cta: "Veranstaltungen entdecken",
    steps: [
      { t: "Finden", d: "Stöbern Sie und filtern Sie nach Kategorie, Stadt oder Datum." },
      { t: "Wählen", d: "Wählen Sie Ihre Tickets und legen Sie sie in den Warenkorb." },
      { t: "Bezahlen", d: "Zahlen Sie per Karte (PostFinance Checkout) oder Überweisung (IBAN)." },
      { t: "Erhalten", d: "Ihre Tickets kommen direkt in Ihr Postfach." },
    ],
  },
  it: {
    title: "Come funziona",
    subtitle: "Prenota i tuoi biglietti in 4 semplici passaggi.",
    cta: "Scopri gli spettacoli",
    steps: [
      { t: "Trova", d: "Esplora e filtra per categoria, città o data." },
      { t: "Scegli", d: "Seleziona i biglietti e aggiungili al carrello." },
      { t: "Paga", d: "Paga con carta (PostFinance Checkout) o bonifico (IBAN)." },
      { t: "Ricevi", d: "I biglietti arrivano direttamente nella tua casella e-mail." },
    ],
  },
} as const;

const icons = [Search, ShoppingBag, CreditCard, Mail];

export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = content[locale as keyof typeof content] ?? content.fr;

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight">{c.title}</h1>
        <p className="mt-3 text-lg text-muted-foreground">{c.subtitle}</p>
      </div>

      <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {c.steps.map((step, i) => {
          const Icon = icons[i];
          return (
            <div
              key={i}
              className="relative rounded-2xl border border-border bg-card p-6"
            >
              <span className="absolute right-4 top-4 text-3xl font-bold text-secondary">
                {i + 1}
              </span>
              <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-6" />
              </div>
              <h3 className="mt-4 font-semibold">{step.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{step.d}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-12 text-center">
        <Link href="/">
          <Button size="lg">{c.cta}</Button>
        </Link>
      </div>
    </div>
  );
}
