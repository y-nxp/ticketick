"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Partage de la page en cours : feuille de partage du téléphone quand elle
 * existe, sinon copie du lien.
 */
export function SharePageButton({ title }: { title: string }) {
  const t = useTranslations("portal");
  const [copied, setCopied] = React.useState(false);

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}`;
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button type="button" variant="outline" onClick={share}>
      {copied ? <Check className="size-4" /> : <Share2 className="size-4" />}
      {copied ? t("linkCopied") : t("share")}
    </Button>
  );
}
