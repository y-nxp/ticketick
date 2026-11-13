import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { catalogActor, forbidIfForeignEvent } from "@/lib/admin/access";
import { programmeBuyers, programmeDeadlines } from "@/lib/orders/programme";
import { prisma } from "@/lib/prisma";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ProgrammeForm } from "./programme-form";

export const dynamic = "force-dynamic";

/** Programme modifié : proposer aux acheteurs de la séance de garder, annuler ou échanger. */
export default async function ProgrammePage({
  params,
}: {
  params: Promise<{ locale: string; id: string; sessionId: string }>;
}) {
  const { locale, id, sessionId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.programme");
  const { organizerId } = await catalogActor();
  await forbidIfForeignEvent(id, organizerId);

  const session = await prisma.eventSession.findFirst({
    where: { id: sessionId, eventId: id },
    select: { startsAt: true, label: true, event: { select: { title: true } } },
  });
  if (!session) notFound();
  const buyers = await programmeBuyers(sessionId);

  const { until, max } = programmeDeadlines(session.startsAt);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href={`/admin/events/${id}`} className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {translate(session.event.title as Translated, locale)}
          {" · "}
          {formatDate(session.startsAt, `${locale}-CH`)}
          {session.label ? ` · ${translate(session.label as Translated, locale)}` : null}
        </p>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{t("intro")}</p>
      </header>

      <ProgrammeForm
        eventId={id}
        sessionId={sessionId}
        locale={locale}
        defaultUntil={until}
        maxUntil={max}
        buyers={buyers.map((b) => ({
          ...b,
          link: b.link
            ? {
                sentAt: formatDate(b.link.sentAt, `${locale}-CH`),
                expiresAt: formatDate(b.link.expiresAt, `${locale}-CH`),
                usedAt: b.link.usedAt ? formatDate(b.link.usedAt, `${locale}-CH`) : null,
              }
            : null,
        }))}
      />
    </div>
  );
}
