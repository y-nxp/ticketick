import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Cpu, SlidersHorizontal, Handshake } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { InquiryChat } from "@/app/[locale]/organizer/inquiry-chat";
import { referenceFlyers } from "@/lib/about/references";
import { teamPhotos } from "@/lib/about/team";
import { cn } from "@/lib/utils";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title"), description: t("metaDescription") };
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
  const teamMembers = t.raw("teamMembers") as {
    name: string;
    org?: string;
    role: string;
  }[];
  const offerItems = t.raw("offerItems") as string[];
  const fields = t.raw("fields") as string[];
  const faqs = [
    { q: t("faqSetupQ"), a: t("faqSetupA") },
    { q: t("faqFeesQ"), a: t("faqFeesA") },
    { q: t("faqDoorQ"), a: t("faqDoorA") },
  ];

  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ticketick",
    url: "https://ticketick.ch",
    email: "support@ticketick.ch",
    description: t("metaDescription"),
    address: {
      "@type": "PostalAddress",
      addressLocality: "Lausanne",
      addressCountry: "CH",
    },
    areaServed: ["CH"],
  };

  return (
    <div className="container-page max-w-4xl py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />

      <h1 className="text-4xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {t("lead")}
      </p>
      <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
        {t("intro")}
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <a href="#contact-projet" className={cn(buttonVariants({ size: "lg" }))}>
          {t("ctaDemo")}
        </a>
        <a
          href="#offre"
          className={cn(buttonVariants({ size: "lg", variant: "outline" }))}
        >
          {t("ctaFeatures")}
        </a>
      </div>

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
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {teamMembers.map((member) => {
            const photo = teamPhotos[member.name];
            return (
              <li
                key={member.name}
                className="flex gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                {photo ? (
                  <Image
                    src={photo}
                    alt={member.name}
                    width={96}
                    height={96}
                    className="size-24 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="font-semibold">{member.name}</p>
                  {member.org ? (
                    <p className="mt-0.5 text-sm font-medium text-primary">
                      {member.org}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {member.role}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="offre" className="mt-14 scroll-mt-24">
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
        <ul className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {referenceFlyers.map((flyer) => (
            <li key={flyer.src}>
              <figure className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <Image
                  src={flyer.src}
                  alt={flyer.alt}
                  width={360}
                  height={510}
                  className="aspect-[3/4] w-full object-cover"
                  sizes="(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 140px"
                />
              </figure>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("faqTitle")}
        </h2>
        <dl className="mt-6 space-y-4">
          {faqs.map((item) => (
            <div
              key={item.q}
              className="rounded-2xl border border-border bg-card p-5 shadow-sm"
            >
              <dt className="font-semibold">{item.q}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        id="contact-projet"
        className="mt-14 scroll-mt-24 rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8"
      >
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("closeTitle")}
        </h2>
        <p className="mt-3 leading-relaxed text-muted-foreground">
          {t("closeLead")}
        </p>
        <div className="mt-6">
          <InquiryChat />
        </div>
      </section>

      <div className="mt-10">
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
