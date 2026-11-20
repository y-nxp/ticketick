import NextLink from "next/link";
import { CloudOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { intlLocale } from "@/lib/i18n-fallback";
import { EVENT_TIME_ZONE } from "@/lib/utils";
import type { BlogCopy } from "./copy";

/** Date d'un article dans la langue de la page (« 19 novembre 2026 »). */
export function articleDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "long", timeZone: EVENT_TIME_ZONE }).format(
    new Date(iso),
  );
}

/** L'API des articles ne répond pas et rien n'est en cache. */
export function BlogUnavailable({ copy, retryHref }: { copy: BlogCopy; retryHref: string }) {
  return (
    <div className="container-page py-24">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-card bg-primary/10">
          <CloudOff className="size-7 text-primary" aria-hidden />
        </div>
        <h1 className="mt-5 text-2xl font-bold">{copy.unavailableTitle}</h1>
        <p className="mt-2 text-muted-foreground">{copy.unavailableBody}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <NextLink href={retryHref} className={buttonVariants()} prefetch={false}>
            {copy.retry}
          </NextLink>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {copy.home}
          </Link>
        </div>
      </div>
    </div>
  );
}
