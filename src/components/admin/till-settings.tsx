import { getTranslations } from "next-intl/server";
import { Banknote, CreditCard, Smartphone, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TwintNumberForm } from "@/components/admin/twint-number-form";
import { prisma } from "@/lib/prisma";

/**
 * Caisse sur place d'un organisateur : ce qui est branché (en ligne) ou non
 * (hors ligne, confirmé à la main), et le numéro TWINT montré au client.
 */
export async function TillSettings({ organizerId }: { organizerId: string }) {
  const t = await getTranslations("admin.payments.till");
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    select: { tillTwintNumber: true, stripe: { select: { enabled: true } } },
  });
  const cardOnline = organizer?.stripe?.enabled === true;
  return (
    <section className="mt-6 rounded-card border border-border bg-card p-5">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Store className="size-5 text-primary" />
        {t("title")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <ul className="mt-4 space-y-3 text-sm">
        <li className="flex gap-3">
          <CreditCard className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium">{t("card")}</span>{" "}
            <Badge variant={cardOnline ? "success" : "secondary"}>{t(cardOnline ? "online" : "offline")}</Badge>
            <span className="mt-0.5 block text-muted-foreground">{t(cardOnline ? "cardOnline" : "cardOffline")}</span>
          </span>
        </li>
        <li className="flex gap-3">
          <Smartphone className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="flex-1">
            <span className="font-medium">{t("twint")}</span> <Badge variant="secondary">{t("offline")}</Badge>
            <span className="mt-0.5 block text-muted-foreground">{t("twintOffline")}</span>
            <span className="mt-2 block">
              <TwintNumberForm key={organizerId} organizerId={organizerId} number={organizer?.tillTwintNumber ?? null} />
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <Banknote className="mt-0.5 size-4 shrink-0 text-primary" />
          <span>
            <span className="font-medium">{t("cash")}</span>
            <span className="mt-0.5 block text-muted-foreground">{t("cashHint")}</span>
          </span>
        </li>
      </ul>
    </section>
  );
}
