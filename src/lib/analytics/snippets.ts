import type { AnalyticsConfig } from "./config";
import { googleConsentState, type Consent } from "./consent";

// Les identifiants sont validés par `analyticsConfig` : ils s'insèrent tels quels.

export function googleIds(config: AnalyticsConfig): string[] {
  return [config.ga4Id, config.googleAdsId].filter((id): id is string => Boolean(id));
}

/** Outils de ticketick, auxquels `track.ts` adresse nommément chaque événement. */
export function siteTagsSnippet(config: AnalyticsConfig): string {
  return `window.__ttTags=${JSON.stringify({ google: googleIds(config), meta: config.metaPixelId })};`;
}

/**
 * Amorce de gtag, posée dans <head> pour exister avant les composants : un
 * événement émis au montage d'une page ne doit pas se perdre. Consent Mode v2
 * refuse tout par défaut ; le choix enregistré du visiteur l'emporte.
 */
export function googleInitSnippet(config: AnalyticsConfig, consent: Consent | null): string {
  const state = JSON.stringify({ ...googleConsentState(consent), wait_for_update: 500 });
  return [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}window.gtag=gtag;",
    `gtag('consent','default',${state});`,
    "gtag('set','ads_data_redaction',true);",
    "gtag('js',new Date());",
    ...googleIds(config).map((id) => `gtag('config','${id}');`),
  ].join("");
}

/**
 * Amorce de Matomo, sans cookie. Les pages vues partent du composant
 * `MatomoTracker`, qui suit aussi les changements d'adresse.
 */
export function matomoInitSnippet(url: string, siteId: string): string {
  return [
    "var _paq=window._paq=window._paq||[];",
    "_paq.push(['disableCookies']);",
    "_paq.push(['enableLinkTracking']);",
    `_paq.push(['setTrackerUrl','${url}/matomo.php']);`,
    `_paq.push(['setSiteId','${siteId}']);`,
    `(function(){var g=document.createElement('script');g.async=true;g.src='${url}/matomo.js';document.head.appendChild(g);})();`,
  ].join("");
}

/** Code de base du pixel Meta, chargé seulement avec l'accord du visiteur. */
export function metaInitSnippet(pixelId: string): string {
  return (
    "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};" +
    "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;" +
    "s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');" +
    `fbq('init','${pixelId}');fbq('track','PageView');`
  );
}
