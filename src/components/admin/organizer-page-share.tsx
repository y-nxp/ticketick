"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

/** Adresse de la page de billetterie de l'organisateur, à diffuser. */
export function OrganizerPageShare({ url }: { url: string }) {
  const t = useTranslations("admin.events.share");
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="mt-6 rounded-card border border-border bg-card p-5">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-control bg-secondary px-3 py-2.5 text-sm">
          {url}
        </code>
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("copied") : t("copy")}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline" })}
        >
          <ExternalLink className="size-4" />
          {t("open")}
        </a>
      </div>
    </section>
  );
}
