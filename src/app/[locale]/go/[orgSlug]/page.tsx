import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { OrganizerShell } from "@/components/branding/organizer-shell";
import { Link } from "@/i18n/navigation";
import {
  getOrganizerBySlug,
  getOrganizerEvents,
} from "@/lib/data/events";
import { formatDate, formatPrice } from "@/lib/utils";
import {
  minPriceCents,
  nextSession,
  t,
  upcomingSessions,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organizer = await getOrganizerBySlug(orgSlug);
  if (!organizer) return {};
  return {
    title: organizer.name,
    description: organizer.website,
  };
}

export default async function OrganizerPortalPage({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>;
}) {
  const { locale, orgSlug } = await params;
  setRequestLocale(locale);

  const organizer = await getOrganizerBySlug(orgSlug);
  if (!organizer) notFound();

  const events = await getOrganizerEvents(organizer.id);
  const tp = await getTranslations("portal");

  return (
    <OrganizerShell organizer={organizer}>
      <p className="organizer-kicker">{tp("tickets")}</p>
      <h1 className="organizer-title">{organizer.name}</h1>
      {organizer.website ? (
        <p className="mt-3 text-sm text-neutral-600">
          <a href={organizer.website} className="hover:underline">
            {tp("visitSite")}
          </a>
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="organizer-title text-2xl">{tp("upcoming")}</h2>
        {events.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">{tp("noEvents")}</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {events.map((event) => {
              const session = nextSession(event);
              const dates = upcomingSessions(event);
              return (
                <li key={event.id}>
                  <Link
                    href={`/go/${organizer.slug}/${event.slug}`}
                    className="block rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition-colors hover:border-[var(--brand-accent)]"
                  >
                    <p className="text-lg font-medium">{t(event.title, locale)}</p>
                    {session ? (
                      <p className="mt-1 text-sm text-neutral-600">
                        {formatDate(session.startsAt, `${locale}-CH`)}
                        {session.venue ? ` · ${session.venue.name}` : ""}
                        {dates.length > 1
                          ? ` · ${tp("dateCount", { count: dates.length })}`
                          : ""}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm font-semibold text-[var(--brand-accent)]">
                      {tp("from")} {formatPrice(minPriceCents(event), `${locale}-CH`)}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </OrganizerShell>
  );
}
