import type { Metadata } from "next";
import Image from "next/image";
import NextLink from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { articlePath, blogIndexPath, type Article } from "@/lib/blog/articles";
import { getArticles } from "@/lib/blog/source";
import { jsonLdScript, SITE_ORIGIN } from "@/lib/seo/event";
import { ogLocale } from "@/lib/seo/site";
import { blogCopy } from "../copy";
import { articleDate, BlogUnavailable } from "../parts";

type Params = Promise<{ locale: string; slug: string }>;

function slugOf(raw: string): string {
  try {
    return decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

async function findArticle(raw: string): Promise<Article | null | undefined> {
  const articles = await getArticles();
  if (!articles) return undefined; // API indisponible
  return articles.find((a) => a.slug === slugOf(raw)) ?? null;
}

/**
 * Un article n'existe que dans sa langue : canonique et variante uniques.
 * Le titre SEO, rédigé au bon gabarit, est repris tel quel (sans « · ticketick.ch »).
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = await findArticle(slug);
  if (article === undefined) return { title: blogCopy(locale).unavailableTitle, robots: { index: false } };
  if (!article) return {};
  const path = articlePath(article);
  return {
    title: { absolute: article.seoTitle },
    description: article.description || undefined,
    keywords: article.keyword ? [article.keyword] : undefined,
    alternates: { canonical: path, languages: { [article.locale]: path } },
    openGraph: {
      siteName: "ticketick.ch",
      type: "article",
      locale: ogLocale(article.locale),
      url: path,
      title: article.seoTitle,
      description: article.description || undefined,
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.modifiedAt ?? undefined,
      ...(article.image ? { images: [{ url: article.image, alt: article.imageAlt }] } : {}),
    },
    twitter: { card: article.image ? "summary_large_image" : "summary" },
  };
}

function articleJsonLd(article: Article): Record<string, unknown>[] {
  const url = `${SITE_ORIGIN}${articlePath(article)}`;
  const organization = { "@type": "Organization", "@id": `${SITE_ORIGIN}/#organization`, name: "ticketick", url: SITE_ORIGIN };
  const data: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: article.title,
      description: article.description || undefined,
      image: article.image ? [article.image] : undefined,
      datePublished: article.publishedAt ?? undefined,
      dateModified: article.modifiedAt ?? undefined,
      inLanguage: article.locale,
      url,
      mainEntityOfPage: { "@type": "WebPage", "@id": url },
      keywords: article.keyword ?? undefined,
      articleSection: article.cluster ?? undefined,
      author: organization,
      publisher: {
        ...organization,
        logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/brand/ticketick-icone-512.png` },
      },
    },
  ];
  if (article.faq.length > 0) {
    data.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      inLanguage: article.locale,
      mainEntity: article.faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    });
  }
  return data;
}

export default async function ArticlePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const article = await findArticle(slug);
  if (article === undefined) {
    return <BlogUnavailable copy={blogCopy(locale)} retryHref={`${blogIndexPath(locale)}/${encodeURIComponent(slugOf(slug))}`} />;
  }
  if (!article) notFound();

  // Article demandé sous une autre langue (`/de/blog/article-francais`,
  // `/en/blog/…`) ou avec des majuscules : vers son adresse.
  if (article.locale !== locale || article.slug !== slug) permanentRedirect(articlePath(article));

  const c = blogCopy(article.locale);
  const published = articleDate(article.publishedAt, article.locale);
  const updated =
    article.modifiedAt && article.publishedAt && article.modifiedAt.slice(0, 10) > article.publishedAt.slice(0, 10)
      ? articleDate(article.modifiedAt, article.locale)
      : null;

  return (
    <article className="container-page py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(articleJsonLd(article)) }} />

      <div className="mx-auto max-w-3xl">
        <NextLink
          href={blogIndexPath(article.locale)}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {c.allArticles}
        </NextLink>

        <header className="mt-6">
          {article.cluster ? <p className="brand-label text-xs text-primary">{article.cluster}</p> : null}
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
          {published ? (
            <p className="mt-4 text-sm text-muted-foreground">
              <time dateTime={article.publishedAt ?? undefined}>{c.published.replace("{date}", published)}</time>
              {updated ? (
                <>
                  {" · "}
                  <time dateTime={article.modifiedAt ?? undefined}>{c.updated.replace("{date}", updated)}</time>
                </>
              ) : null}
            </p>
          ) : null}
        </header>

        {article.image ? (
          <figure className="relative mt-8 aspect-[16/9] overflow-hidden rounded-card border border-border bg-muted">
            <Image
              src={article.image}
              alt={article.imageAlt}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </figure>
        ) : null}

        {/* HTML du Manager, assaini à la lecture (src/lib/blog/sanitize.ts). */}
        <div className="article-body mt-10" dangerouslySetInnerHTML={{ __html: article.html }} />

        {article.faq.length > 0 ? (
          <section className="mt-14" aria-labelledby="article-faq">
            <h2 id="article-faq" className="text-2xl font-semibold tracking-tight">
              {c.faqTitle}
            </h2>
            <dl className="mt-6 space-y-4">
              {article.faq.map((item) => (
                <div key={item.q} className="rounded-card border border-border bg-card p-5 shadow-sm">
                  <dt className="font-semibold">{item.q}</dt>
                  <dd className="mt-2 leading-relaxed text-muted-foreground">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <section className="mt-14 rounded-card border border-border bg-card p-6 sm:p-8">
          <h2 className="text-2xl font-bold tracking-tight">{c.ctaTitle}</h2>
          <p className="mt-2 text-muted-foreground">{c.ctaLead}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/organizer#contact">
              <Button size="lg" className="gap-2">
                {c.cta}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="outline">
                {c.pricing}
              </Button>
            </Link>
          </div>
        </section>
      </div>
    </article>
  );
}
