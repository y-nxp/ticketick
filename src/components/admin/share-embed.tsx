"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function ShareEmbed({
  origin,
  eventSlug,
  organizerSlug,
}: {
  origin: string;
  eventSlug: string;
  organizerSlug: string;
}) {
  const t = useTranslations("admin.embed");
  const pageUrl = `${origin}/go/${organizerSlug}/${eventSlug}`;
  const script = `<script src="${origin}/embed.js" data-event="${eventSlug}"></script>`;
  const iframe = `<iframe src="${origin}/embed/events/${eventSlug}" title="Billetterie" style="border:0;width:100%;max-width:720px;min-height:640px" loading="lazy"></iframe>`;

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>

      <div className="mt-5 space-y-5">
        <Snippet label={t("pageTitle")} hint={t("pageHint")} value={pageUrl} />
        <Snippet label={t("scriptTitle")} hint={t("scriptHint")} value={script} />
        <Snippet label={t("iframeTitle")} hint={t("iframeHint")} value={iframe} />
      </div>
    </section>
  );
}

function Snippet({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: string;
}) {
  const t = useTranslations("admin.embed");
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <pre className="mt-2 overflow-x-auto rounded-xl bg-secondary p-3 text-xs leading-relaxed">
        {value}
      </pre>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={copy}>
        {copied ? t("copied") : t("copy")}
      </Button>
    </div>
  );
}
