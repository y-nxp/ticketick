"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CONSENT_OPEN_EVENT, writeConsentCookie, type Consent } from "@/lib/analytics/consent";

/** Accepter et refuser ont le même poids : refuser ne doit pas coûter un clic de plus. */
export function ConsentBanner({ open }: { open: boolean }) {
  const t = useTranslations("consent");
  const [reopened, setReopened] = React.useState(false);

  React.useEffect(() => {
    const onOpen = () => setReopened(true);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  if (!open && !reopened) return null;

  const choose = (consent: Consent) => {
    setReopened(false);
    writeConsentCookie(consent);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("title")}
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-card border border-border bg-card p-4 text-sm shadow-lg sm:inset-x-auto sm:left-4 sm:p-5"
    >
      <p className="font-medium">{t("title")}</p>
      <p className="mt-1.5 text-muted-foreground">
        {t("text")}{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          {t("learnMore")}
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => choose("granted")}>
          {t("accept")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => choose("denied")}>
          {t("decline")}
        </Button>
      </div>
    </div>
  );
}
