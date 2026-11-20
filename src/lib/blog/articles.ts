/**
 * Articles du blog, rédigés et validés dans le Manager Nextalp
 * (`manager.nextalp.com/api/public/articles?site=ticketick`).
 *
 * Module pur : normalise la réponse de l'API (lu par les pages, le sitemap et
 * les tests). La lecture réseau et le cache vivent dans `./source.ts`.
 *
 * Langues : un article existe dans une seule langue. Français → servi sous la
 * langue par défaut (`/blog/slug`), allemand → `/de/blog/slug`. La liste d'une
 * langue sans article (anglais, italien, espagnol) montre les articles
 * français, avec une mention.
 */
import { routing } from "../../i18n/routing";
import { sanitizeArticleHtml } from "./sanitize";

export const ARTICLES_API = "https://manager.nextalp.com/api/public/articles?site=ticketick";

/** Langues dans lesquelles un article peut être publié (toutes sauf l'espagnol, réservé à la boutique). */
export const ARTICLE_LOCALES = ["fr", "de", "en", "it"] as const;
export type ArticleLocale = (typeof ARTICLE_LOCALES)[number];

/** Langue de repli de la liste quand une langue n'a pas d'article. */
export const FALLBACK_ARTICLE_LOCALE: ArticleLocale = "fr";

export interface FaqItem {
  q: string;
  a: string;
}

export interface Article {
  slug: string;
  locale: ArticleLocale;
  title: string;
  seoTitle: string;
  description: string;
  publishedAt: string | null;
  /** La plus récente des deux dates de l'API (l'article peut être republié sans être modifié). */
  modifiedAt: string | null;
  /** Corps assaini (`./sanitize.ts`), liens internes déjà réécrits. */
  html: string;
  image: string | null;
  imageAlt: string;
  faq: FaqItem[];
  keyword: string | null;
  cluster: string | null;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown): string | null {
  return text(value) || null;
}

/** `fr`, `FR`, `fr-CH`, `de_CH` → langue du site, ou `null` si elle n'en est pas une. */
export function articleLocale(language: unknown): ArticleLocale | null {
  const code = text(language).toLowerCase().split(/[-_]/)[0];
  return (ARTICLE_LOCALES as readonly string[]).includes(code) ? (code as ArticleLocale) : null;
}

/** Adresse publique d'un article : préfixe de langue sauf pour le français. */
export function articlePath(article: { slug: string; locale: string }): string {
  const prefix = article.locale === routing.defaultLocale ? "" : `/${article.locale}`;
  return `${prefix}/blog/${article.slug}`;
}

/** Adresse de la liste dans une langue. */
export function blogIndexPath(locale: string): string {
  return locale === routing.defaultLocale ? "/blog" : `/${locale}/blog`;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function faqEntry(value: unknown): FaqItem | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const q = text(v.q ?? v.question ?? v.Q ?? v.frage);
  const a = text(v.a ?? v.answer ?? v.A ?? v.r ?? v.reponse ?? v.antwort);
  return q && a ? { q, a } : null;
}

/** FAQ en texte libre : « Q : … » puis « R : … » (ou « F: » / « A: » en allemand). */
function faqFromText(raw: string): FaqItem[] {
  const items: FaqItem[] = [];
  let current: { q: string; a: string } | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const question = line.match(/^\s*(?:Q|F|Question|Frage)\s*[.:]\s*(.+)$/i);
    const answer = line.match(/^\s*(?:A|R|Réponse|Reponse|Antwort|Answer)\s*[.:]\s*(.+)$/i);
    if (question) {
      if (current?.q && current.a) items.push(current);
      current = { q: question[1].trim(), a: "" };
    } else if (answer && current) {
      current.a = [current.a, answer[1].trim()].filter(Boolean).join(" ");
    } else if (current?.a && line.trim()) {
      current.a = `${current.a} ${line.trim()}`;
    }
  }
  if (current?.q && current.a) items.push(current);
  return items;
}

/**
 * FAQ de l'API : liste d'objets `{q, a}` en général, mais elle peut arriver
 * sérialisée en chaîne JSON, sous un autre nom de champ, ou en texte libre.
 */
export function parseFaq(raw: unknown): FaqItem[] {
  if (raw == null) return [];
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return parseFaq(JSON.parse(trimmed));
      } catch {
        return faqFromText(trimmed);
      }
    }
    return faqFromText(trimmed);
  }
  if (Array.isArray(raw)) return raw.map(faqEntry).filter((x): x is FaqItem => x !== null);
  if (typeof raw === "object") {
    const v = raw as Record<string, unknown>;
    if (Array.isArray(v.items)) return parseFaq(v.items);
    const single = faqEntry(v);
    return single ? [single] : [];
  }
  return [];
}

function httpsUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Champs d'un article, sans le corps. `null` si l'article est inutilisable. */
function normalizeFields(raw: unknown): Omit<Article, "html"> & { rawHtml: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const slug = text(r.slug).toLowerCase();
  const locale = articleLocale(r.language);
  const title = text(r.title);
  const rawHtml = text(r.html);
  if (!SLUG.test(slug) || !locale || !title || !rawHtml) return null;
  const publishedAt = isoDate(r.publishedAt);
  return {
    slug,
    locale,
    title,
    seoTitle: text(r.seoTitle) || title,
    description: text(r.description),
    publishedAt,
    modifiedAt: latest(publishedAt, isoDate(r.updatedAt)),
    rawHtml,
    image: httpsUrl(r.image),
    imageAlt: text(r.imageAlt) || title,
    faq: parseFaq(r.faq),
    keyword: optionalText(r.keyword),
    cluster: optionalText(r.cluster),
  };
}

/**
 * Réponse brute de l'API → articles prêts à afficher, du plus récent au plus
 * ancien. Les articles incomplets (slug, langue, titre ou corps manquant) et
 * les doublons de slug sont écartés. Lève une erreur si la réponse n'a pas la
 * forme attendue : l'appelant la traite comme une API indisponible.
 */
export function prepareArticles(payload: unknown): Article[] {
  const list =
    payload && typeof payload === "object" && Array.isArray((payload as { articles?: unknown }).articles)
      ? (payload as { articles: unknown[] }).articles
      : null;
  if (!list) throw new Error("Réponse inattendue de l'API des articles");

  const fields = new Map<string, NonNullable<ReturnType<typeof normalizeFields>>>();
  for (const raw of list) {
    const f = normalizeFields(raw);
    if (f && !fields.has(f.slug)) fields.set(f.slug, f);
  }

  // Les liens entre articles se réécrivent vers l'adresse de la langue de l'article visé.
  const known = new Map([...fields.values()].map((f) => [f.slug, articlePath(f)]));

  return [...fields.values()]
    .map(({ rawHtml, ...f }) => ({ ...f, html: sanitizeArticleHtml(rawHtml, { articlePaths: known }) }))
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
}

/**
 * Langue des articles montrés par la liste de `locale` : la sienne si elle
 * en a, sinon le français (anglais, italien et espagnol aujourd'hui).
 */
export function listingLocale(locale: string, articles: readonly Pick<Article, "locale">[]): ArticleLocale {
  return articles.some((a) => a.locale === locale) ? (locale as ArticleLocale) : FALLBACK_ARTICLE_LOCALE;
}

/** Langues qui ont au moins un article : celles qui ont une vraie liste à indexer. */
export function localesWithArticles(articles: readonly Pick<Article, "locale">[]): ArticleLocale[] {
  return ARTICLE_LOCALES.filter((l) => articles.some((a) => a.locale === l));
}
