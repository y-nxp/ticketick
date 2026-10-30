import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { PromoteSection } from "@/components/admin/promotion/promote-section";
import { SalesPauseSection } from "@/components/admin/sales-pause-section";
import { ShareEmbed } from "@/components/admin/share-embed";
import { canSeePromotionUi } from "@/lib/admin/promotion-visibility";
import { publicAppOrigin } from "@/lib/app-url";
import { getCurrentUser } from "@/lib/auth/dal";
import { getEventForEdit, getReferenceData, getSalesAlerts } from "@/lib/data/admin-catalog";
import { EventForm } from "../event-form";
import { OptionsEditor } from "../options-editor";
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

  const [event, reference, user, alerts] = await Promise.all([
    getEventForEdit(id),
    getReferenceData(),
    getCurrentUser(),
    getSalesAlerts(id),
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

      <div className="rounded-card border border-border bg-card p-6">
        <EventForm event={event} reference={reference} />
      </div>

      <SalesPauseSection
        eventId={event.id}
        paused={event.salesPaused}
        locale={locale}
        alerts={alerts.map((a) => ({
          id: a.id,
          email: a.email,
          locale: a.locale,
          createdAt: a.createdAt.toISOString(),
          notifiedAt: a.notifiedAt?.toISOString() ?? null,
        }))}
      />

      <ShareEmbed
        origin={publicAppOrigin()}
        eventSlug={event.slug}
        organizerSlug={event.organizer.slug}
      />

      {canSeePromotionUi(user) ? <PromoteSection eventId={event.id} locale={locale} /> : null}

      <SessionsEditor event={event} reference={reference} />
      <OptionsEditor event={event} />
    </div>
  );
}
