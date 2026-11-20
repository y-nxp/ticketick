import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { ARTICLES_API, prepareArticles, type Article } from "./articles";

/** Les articles changent au plus quelques fois par jour : relus toutes les heures. */
export const ARTICLES_REVALIDATE_SECONDS = 3600;

/** Au-delà, l'API est tenue pour indisponible : la page ne reste pas suspendue. */
const TIMEOUT_MS = 8000;

/**
 * Articles normalisés et assainis, gardés une heure dans le cache de Next.js
 * (fichiers de `.next/cache`, partagé par toutes les pages et le sitemap).
 * Une erreur n'est pas mise en cache : à l'expiration, si l'API ne répond
 * pas, la version précédente reste servie.
 */
const cachedArticles = unstable_cache(
  async (): Promise<Article[]> => {
    const response = await fetch(ARTICLES_API, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`API des articles : HTTP ${response.status}`);
    return prepareArticles(await response.json());
  },
  ["blog-articles-v1"],
  { revalidate: ARTICLES_REVALIDATE_SECONDS, tags: ["blog-articles"] },
);

/**
 * Tous les articles publiés, ou `null` si l'API ne répond pas (aucune
 * version en cache) : la page affiche alors un message d'indisponibilité.
 */
export const getArticles = cache(async (): Promise<Article[] | null> => {
  try {
    return await cachedArticles();
  } catch (error) {
    console.error("[blog] articles indisponibles :", error instanceof Error ? error.message : error);
    return null;
  }
});
