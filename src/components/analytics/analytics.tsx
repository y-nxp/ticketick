"use client";

import * as React from "react";
import Script from "next/script";
import { usePathname } from "@/i18n/navigation";
import type { AnalyticsConfig } from "@/lib/analytics/config";
import { CONSENT_CHANGED_EVENT, googleConsentState, type Consent } from "@/lib/analytics/consent";
import { googleIds, metaInitSnippet } from "@/lib/analytics/snippets";
import { trackSitePageView } from "@/lib/analytics/track";
import { ConsentDialog } from "./consent-dialog";

/**
 * Pages où la fenêtre ne s'ouvre pas d'elle-même : écrans du personnel, où
 * elle bloquerait le travail, et pages légales, qu'elle cacherait. Le lien
 * « Cookies » du pied de page la rouvre partout.
 */
const NO_PROMPT = ["/admin", "/door", "/pos", "/privacy", "/terms"];

/**
 * Charge Google et Meta selon le choix du visiteur, et ouvre la fenêtre de
 * choix tant qu'il n'a pas répondu. Rien sur le widget posé chez les
 * organisateurs : la page d'accueil de l'iframe n'est pas la leur.
 */
export function Analytics({
  config,
  initialConsent,
}: {
  config: AnalyticsConfig;
  initialConsent: Consent | null;
}) {
  const pathname = usePathname();
  const [consent, setConsent] = React.useState<Consent | null>(initialConsent);

  React.useEffect(() => {
    const onChange = (e: Event) => {
      const next = (e as CustomEvent<Consent>).detail;
      setConsent(next);
      window.gtag?.("consent", "update", googleConsentState(next));
      window.fbq?.("consent", next.ads ? "grant" : "revoke");
    };
    window.addEventListener(CONSENT_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onChange);
  }, []);

  // GA4 suit seul les changements d'adresse ; Meta, non.
  const firstPath = React.useRef(true);
  React.useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    trackSitePageView();
  }, [pathname]);

  if (pathname.startsWith("/embed")) return null;

  const google = googleIds(config);
  // Accord déjà connu au rendu : le pixel est amorcé dans <head> par la mise en page.
  const loadMetaHere = Boolean(config.metaPixelId) && Boolean(consent?.ads) && !initialConsent?.ads;
  const prompt = consent === null && !NO_PROMPT.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <>
      {google.length > 0 ? (
        <Script src={`https://www.googletagmanager.com/gtag/js?id=${google[0]}`} strategy="afterInteractive" />
      ) : null}
      {loadMetaHere && config.metaPixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {metaInitSnippet(config.metaPixelId)}
        </Script>
      ) : null}
      <ConsentDialog open={prompt} current={consent} />
    </>
  );
}
