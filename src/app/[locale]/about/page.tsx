import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Cpu, SlidersHorizontal, Handshake } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title"), description: t("lead") };
}

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");

  const stats = [
    { value: t("statYears"), label: t("statYearsLabel") },
    { value: t("statEvents"), label: t("statEventsLabel") },
    { value: t("statTickets"), label: t("statTicketsLabel") },
  ];
  const strengths = [
    {
      icon: Cpu,
      title: t("expertiseTitle"),
      body: t("expertiseBody"),
    },
    {
      icon: SlidersHorizontal,
      title: t("flexibilityTitle"),
      body: t("flexibilityBody"),
    },
    {
      icon: Handshake,
      title: t("proximityTitle"),
      body: t("proximityBody"),
    },
  ];
  const offerItems = t.raw("offerItems") as string[];
  const fields = t.raw("fields") as string[];
  const references = t.raw("references") as string[];

  return (
    <div className="container-page max-w-4xl py-16">
      <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {t("lead")}
      </p>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        {t("intro")}
      </p>

      <dl className="mt-10 grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm"
          >
            <dt className="text-sm text-muted-foreground">{stat.label}</dt>
            <dd className="mt-1 text-3xl font-extrabold tracking-tight text-foreground">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-14 text-2xl font-semibold tracking-tight">
        {t("strengthsTitle")}
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {strengths.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
              <item.icon className="size-5" />
            </div>
            <h3 className="mt-4 font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {item.body}
            </p>
          </div>
        ))}
      </div>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("teamTitle")}
        </h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {t("teamBody")}
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("offerTitle")}
        </h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {t("offerIntro")}
        </p>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-muted-foreground">
          {offerItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("fieldsTitle")}
        </h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {fields.map((field) => (
            <span
              key={field}
              className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium"
            >
              {field}
            </span>
          ))}
        </div>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("referencesTitle")}
        </h2>
        <p className="mt-4 leading-relaxed text-muted-foreground">
          {t("referencesIntro")}
        </p>
        <ul className="mt-4 columns-1 gap-x-8 text-foreground sm:columns-2">
          {references.map((name) => (
            <li key={name} className="py-1">
              {name}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-12 flex flex-wrap gap-3">
        <Link
          href="/organizer"
          className={cn(buttonVariants({ size: "lg" }))}
        >
          {t("ctaOrganizer")}
        </Link>
        <Link
          href="/"
          className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
        >
          {t("ctaEvents")}
        </Link>
      </div>
    </div>
  );
}
