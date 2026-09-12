import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getEventForEdit, getReferenceData } from "@/lib/data/admin-catalog";
import { EventForm } from "../event-form";
import { SessionsEditor } from "../sessions-editor";

export const dynamic = "force-dynamic";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.eventForm");

  const [event, reference] = await Promise.all([
    getEventForEdit(id),
    getReferenceData(),
  ]);

  if (!event) notFound();

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/events" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("editTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("editSubtitle")}</p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6">
        <EventForm event={event} reference={reference} />
      </div>

      <SessionsEditor event={event} reference={reference} />
    </div>
  );
}
