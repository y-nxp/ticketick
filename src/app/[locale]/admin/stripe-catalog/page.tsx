import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { catalogActor } from "@/lib/admin/access";
import { previewStripeCatalog } from "@/lib/payment/stripe-catalog";
import type { CatalogStep, TariffPlan } from "@/lib/payment/stripe-catalog-plan";
import { prisma } from "@/lib/prisma";
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";
import { SyncButton } from "./sync-button";
import { TwintNumberForm } from "@/components/admin/twint-number-form";

export const dynamic = "force-dynamic";

type DateStep = Exclude<CatalogStep, { kind: "archive" }>;

/**
 * Dates à venir dans le catalogue Stripe de l'organisateur (un produit par
 * date, un prix par tarif), pour la vente à la caisse avec le lecteur Stripe.
 */
export default async function StripeCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ organizer?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { user, organizerId: own } = await catalogActor();
  const t = await getTranslations("admin.stripeCatalog");
  const query = await searchParams;
  const intl = `${locale}-CH`;

  const organizers = own
    ? []
    : await prisma.organizer.findMany({
        where: { stripe: { enabled: true } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
  const organizerId = own ?? organizers.find((o) => o.id === query.organizer)?.id ?? organizers[0]?.id ?? null;

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition-colors ${
      active ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"
    }`;
  const header = (
    <header className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>
      {organizers.length > 1 ? (
        <nav aria-label={t("organizer")} className="flex flex-wrap gap-2">
          {organizers.map((o) => (
            <Link
              key={o.id}
              href={{ pathname: "/admin/stripe-catalog", query: { organizer: o.id } }}
              aria-current={o.id === organizerId ? "page" : undefined}
              className={pill(o.id === organizerId)}
            >
              {o.name}
            </Link>
          ))}
        </nav>
      ) : null}
    </header>
  );
  const empty = (message: string) => (
    <div className="space-y-6">
      {header}
      <p className="rounded-card border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        {message}
        {user.role === "ADMIN" ? (
          <>
            {" "}
            <Link href="/admin/payments" className="text-primary hover:underline">
              {t("toPayments")}
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );

  if (!organizerId) return empty(t("noOrganizer"));
  const outcome = await previewStripeCatalog(organizerId);
  if (!outcome.ok && outcome.error === "noAccount") return empty(t("noAccount"));

  if (!outcome.ok) {
    return (
      <div className="space-y-6">
        {header}
        <p role="alert" className="flex items-start gap-2 rounded-card border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {t(`errors.${outcome.error}`)}
        </p>
        <section className="rounded-card border border-border bg-card p-5">
          <TwintNumberForm organizerId={organizerId} number={await twintNumberOf(organizerId)} />
        </section>
      </div>
    );
  }

  const { account, steps, counts } = outcome.preview;
  const when = (date: Date) =>
    new Intl.DateTimeFormat(intl, {
      timeZone: EVENT_TIME_ZONE,
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);

  const events = new Map<string, { title: string; steps: DateStep[] }>();
  for (const step of steps) {
    if (step.kind === "archive") continue;
    const group = events.get(step.session.eventId) ?? { title: step.session.eventTitle, steps: [] };
    group.steps.push(step);
    events.set(step.session.eventId, group);
  }
  const archived = steps.filter((s) => s.kind === "archive");
  const toDo = counts.create + counts.update + counts.archive;

  const status = (step: DateStep, plan: TariffPlan) => {
    if (step.kind === "create" || plan.state.kind === "create") return <Badge>{t("state.create")}</Badge>;
    if (plan.state.kind === "reprice") {
      const old = plan.state.old.cents;
      return (
        <Badge variant="secondary">
          {old != null ? t("state.newPrice", { old: formatPrice(old, intl) }) : t("state.price")}
        </Badge>
      );
    }
    if (plan.state.kind === "rename") return <Badge variant="secondary">{t("state.details")}</Badge>;
    if (step.kind === "update") {
      if (step.changes.includes("reactivate")) return <Badge variant="secondary">{t("state.reactivate")}</Badge>;
      if (step.changes.some((c) => c !== "prices")) return <Badge variant="secondary">{t("state.details")}</Badge>;
    }
    return <Badge variant="success">{t("state.keep")}</Badge>;
  };
  const tile = (label: string, value: number) => (
    <div className="rounded-card border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );

  return (
    <div className="space-y-8">
      {header}

      <section className="space-y-4 rounded-card border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <CreditCard className="size-4 text-muted-foreground" />
          <span className="font-medium">{account.name ?? t("account")}</span>
          <Badge variant="outline">{account.live ? t("live") : t("test")}</Badge>
          <span className="text-muted-foreground">
            {account.syncedAt
              ? t("syncedAt", { date: when(account.syncedAt) })
              : t("neverSynced")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tile(t("counts.create"), counts.create)}
          {tile(t("counts.update"), counts.update)}
          {tile(t("counts.keep"), counts.keep)}
          {tile(t("counts.archive"), counts.archive)}
        </div>
        <SyncButton
          organizerId={organizerId}
          label={toDo > 0 ? t("syncAll", { count: toDo }) : t("syncAgain")}
        />
        <div className="border-t border-border pt-4">
          <TwintNumberForm organizerId={organizerId} number={await twintNumberOf(organizerId)} />
        </div>
        <p className="text-xs text-muted-foreground">{t("howTo")}</p>
        <p className="text-xs text-muted-foreground">{t("stockNote")}</p>
      </section>

      {events.size === 0 ? (
        <p className="rounded-card border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          {t("noTariffs")}
        </p>
      ) : null}

      {[...events.entries()].map(([eventId, group]) => {
        // Toujours affiché : après la synchro, le bouton porte le message du résultat.
        return (
          <section key={eventId} className="overflow-hidden rounded-card border border-border">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/40 px-4 py-3">
              <div>
                <h2 className="font-semibold">{group.title}</h2>
                <p className="text-xs text-muted-foreground">
                  {t("eventSummary", {
                    dates: group.steps.length,
                    tariffs: group.steps.reduce((n, step) => n + step.tariffs.length, 0),
                  })}
                </p>
              </div>
              <SyncButton
                organizerId={organizerId}
                eventId={eventId}
                variant="outline"
                label={t("syncEvent")}
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{t("columns.date")}</th>
                    <th className="px-4 py-2 font-semibold">{t("columns.tariff")}</th>
                    <th className="px-4 py-2 text-right font-semibold">{t("columns.price")}</th>
                    <th className="px-4 py-2 font-semibold">{t("columns.state")}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.steps.flatMap((step) =>
                    step.tariffs.map((plan, index) => (
                      <tr
                        key={plan.tariff.ticketTypeId}
                        className={index === 0 ? "border-t border-border" : undefined}
                      >
                        {index === 0 ? (
                          <td rowSpan={step.tariffs.length} className="px-4 py-2 align-top">
                            <span className="whitespace-nowrap tabular-nums">{when(step.session.startsAt)}</span>
                            <span className="block text-xs text-muted-foreground">{step.session.name}</span>
                          </td>
                        ) : null}
                        <td className="px-4 py-2">{plan.tariff.tariff}</td>
                        <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">
                          {formatPrice(plan.tariff.priceCents, intl)}
                        </td>
                        <td className="px-4 py-2">{status(step, plan)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {archived.length > 0 ? (
        <details className="rounded-card border border-border p-4">
          <summary className="cursor-pointer font-semibold">
            {t("archiveTitle")} ({archived.length})
          </summary>
          <p className="mt-1 text-xs text-muted-foreground">{t("archiveHint")}</p>
          <ul className="mt-3 space-y-1 text-sm">
            {archived.map((step) => (
              <li key={step.product.id}>{step.product.name}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

async function twintNumberOf(organizerId: string): Promise<string | null> {
  const row = await prisma.organizer.findUnique({ where: { id: organizerId }, select: { tillTwintNumber: true } });
  return row?.tillTwintNumber ?? null;
}
