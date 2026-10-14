import type { AnalyticsConfig } from "./config";
import type { Consent } from "./consent";

// Les identifiants sont validés par `analyticsConfig` : ils s'insèrent tels quels.

export function googleIds(config: AnalyticsConfig): string[] {
  return [config.ga4Id, config.googleAdsId].filter((id): id is string => Boolean(id));
}

/**
 * Amorce de gtag, posée dans <head> pour exister avant les composants : un
 * événement émis au montage d'une page ne doit pas se perdre. Consent Mode v2
 * refuse tout par défaut ; le choix enregistré du visiteur l'emporte.
 */
export function googleInitSnippet(config: AnalyticsConfig, consent: Consent | null): string {
  const state = consent === "granted" ? "granted" : "denied";
  return [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments);}window.gtag=gtag;",
    `gtag('consent','default',{ad_storage:'${state}',ad_user_data:'${state}',ad_personalization:'${state}',analytics_storage:'${state}',wait_for_update:500});`,
    "gtag('set','ads_data_redaction',true);",
    "gtag('js',new Date());",
    ...googleIds(config).map((id) => `gtag('config','${id}');`),
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
