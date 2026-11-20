import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import { setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import {
  articlePath,
  blogIndexPath,
  listingLocale,
  localesWithArticles,
  type Article,
} from "@/lib/blog/articles";
import { getArticles } from "@/lib/blog/source";
import { siteOpenGraph } from "@/lib/seo/site";
import { blogCopy } from "./copy";
import { articleDate, BlogUnavailable } from "./parts";

/**
 * Liste des articles d'une langue. Sans article dans la langue de la page
 * (anglais, italien, espagnol), elle montre les articles français avec une
 * mention ; son adresse canonique est alors celle de la liste française.
 */
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const c = blogCopy(locale);
  const articles = await getArticles();
  if (!articles) return { title: c.unavailableTitle, robots: { index: false } };
  const shown = listingLocale(locale, articles);
  const languages = Object.fromEntries([
    ...localesWithArticles(articles).map((l) => [l, blogIndexPath(l)]),
    ["x-default", blogIndexPath("fr")],
  ]);
  return {
    title: c.title,
    description: c.description,
    alternates: { canonical: blogIndexPath(shown), languages },
    openGraph: { ...siteOpenGraph(locale), title: c.title, description: c.description, url: blogIndexPath(locale) },
  };
}

export default async function BlogPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const c = blogCopy(locale);
  const articles = await getArticles();
  if (!articles) return <BlogUnavailable copy={c} retryHref={blogIndexPath(locale)} />;

  const shown = listingLocale(locale, articles);
  const list = articles.filter((a) => a.locale === shown);
  // Lien vers les articles allemands depuis les listes qui montrent le français.
  // (Pas l'inverse : `/blog` sans préfixe renverrait un lecteur germanophone vers `/de/blog`.)
  const german = shown !== "de" && localesWithArticles(articles).includes("de");

  return (
    <div className="container-page py-12">
      <div className="max-w-2xl">
        <span className="inline-flex items-center rounded-full border border-border bg-card px-4 py-1.5 text-sm font-medium">
          {c.badge}
        </span>
        <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">{c.title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{c.lead}</p>
        {shown !== locale && c.fallbackNotice ? (
          <p className="mt-4 rounded-card border border-border bg-accent px-4 py-3 text-sm text-accent-foreground">
            {c.fallbackNotice}
          </p>
        ) : null}
        {german ? (
          <p className="mt-4 text-sm">
            <NextLink href={blogIndexPath("de")} hrefLang="de" lang="de" className="font-medium text-primary hover:underline">
              {c.otherLanguage} →
            </NextLink>
          </p>
        ) : null}
      </div>

      {list.length === 0 ? (
        <p className="mt-10 text-muted-foreground">{c.empty}</p>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((article, i) => (
            <li key={article.slug}>
              <ArticleCard article={article} locale={locale} readLabel={c.read} priority={i < 3} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ArticleCard({
  article,
  locale,
  readLabel,
  priority,
}: {
  article: Article;
  locale: string;
  readLabel: string;
  priority: boolean;
}) {
  const href = articlePath(article);
  const date = articleDate(article.publishedAt, locale);
  return (
    <article
      lang={article.locale === locale ? undefined : article.locale}
      className="group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      {article.image ? (
        <div className="relative aspect-[16/9] bg-muted">
          <Image
            src={article.image}
            alt={article.imageAlt}
            fill
            priority={priority}
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px"
            className="object-cover"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-5">
        {article.cluster ? <p className="brand-label text-xs text-primary">{article.cluster}</p> : null}
        <h2 className="mt-2 text-lg font-semibold leading-snug">
          <NextLink href={href} className="after:absolute after:inset-0 after:rounded-card">
            {article.title}
          </NextLink>
        </h2>
        {article.description ? (
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{article.description}</p>
        ) : null}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4 text-sm">
          {date ? (
            <time dateTime={article.publishedAt ?? undefined} className="text-muted-foreground">
              {date}
            </time>
          ) : (
            <span />
          )}
          <span lang={locale} className="inline-flex items-center gap-1 font-medium text-primary">
            {readLabel}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </span>
        </div>
      </div>
    </article>
  );
}
