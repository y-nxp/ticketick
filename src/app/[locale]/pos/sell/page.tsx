import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { requireResellerAgent } from "@/lib/auth/dal";
import { getPosShows } from "@/lib/resellers/data";
import { t as translate, type Translated } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PosSellPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const agent = await requireResellerAgent("/pos/sell");
  const t = await getTranslations("pos.sell");
  const shows = await getPosShows(agent);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>
      {shows.length === 0 ? (
        <p className="rounded-card border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t("none")}
        </p>
      ) : (
        <ul className="space-y-4">
          {shows.map((show) => (
            <li
              key={show.id}
              id={show.id}
              className="scroll-mt-24 rounded-card border border-border bg-card p-5"
            >
              <h2 className="text-lg">{translate(show.title as Translated, locale)}</h2>
              <p className="text-xs text-muted-foreground">{show.organizer.name}</p>
              <ul className="mt-3 divide-y divide-border">
                {show.sessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/pos/sell/${s.id}`}
                      className="flex items-center gap-3 rounded-control px-2 py-3 text-sm transition-colors hover:bg-muted"
                    >
                      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{formatDate(s.startsAt, `${locale}-CH`)}</span>
                        {s.label ? ` · ${translate(s.label as Translated, locale)}` : null}
                        {s.venue ? (
                          <span className="block text-xs text-muted-foreground">
                            {s.venue.name}, {s.venue.city}
                          </span>
                        ) : null}
                      </span>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
