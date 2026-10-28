import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getComposerData } from "@/lib/data/promotion";
import { t as translate } from "@/lib/types";
import { Composer } from "./composer";

export const dynamic = "force-dynamic";

/**
 * Compositeur `/admin/promotion/nouveau?event={id}` (docs/module-promotion.md,
 * § 2.4). Accès par `getComposerData` : `catalogActor()` puis
 * `forbidIfForeignEvent`, quel que soit l'affichage des entrées de menu.
 */
export default async function NewPromotionPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { event: eventId } = await searchParams;
  if (!eventId) notFound();

  const [data, t] = await Promise.all([getComposerData(eventId), getTranslations("admin.promotion")]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href={`/admin/events/${data.event.id}`} className="hover:text-foreground">
            {t("composer.back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("composer.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("composer.subtitle", {
            event: translate(data.event.title, locale),
            organizer: data.event.organizerName,
          })}
        </p>
      </header>
      <Composer data={data} uiLocale={locale} />
    </div>
  );
}
