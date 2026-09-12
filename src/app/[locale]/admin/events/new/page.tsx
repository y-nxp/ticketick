import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getReferenceData } from "@/lib/data/admin-catalog";
import { EventForm } from "../event-form";

export const dynamic = "force-dynamic";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.eventForm");
  const reference = await getReferenceData();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/events" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("createTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("createSubtitle")}</p>
      </header>

      {reference.organizers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
          {t("needOrganizer")}{" "}
          <Link href="/admin/settings" className="font-medium text-primary hover:underline">
            {t("goToSettings")}
          </Link>
        </p>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          <EventForm reference={reference} />
        </div>
      )}
    </div>
  );
}
