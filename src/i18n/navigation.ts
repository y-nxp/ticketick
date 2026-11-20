import { createElement, useMemo, type ComponentProps } from "react";
import { useLocale } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { internalPath, localizePath } from "./pathnames";
import { routing } from "./routing";

/**
 * Navigation de next-intl, avec les adresses traduites (`./pathnames`) : le
 * code écrit l'adresse interne (`/pricing`, `/events/slug`), le visiteur voit
 * celle de sa langue (`/tarifs`, `/de/preise`, `/spectacles/slug`).
 */
const nav = createNavigation(routing);

type Href = ComponentProps<typeof nav.Link>["href"];

function localizeHref<H extends Href>(href: H, locale: string): H {
  if (typeof href === "string") return localizePath(href, locale) as H;
  if (href && typeof href === "object" && typeof href.pathname === "string") {
    return { ...href, pathname: localizePath(href.pathname, locale) } as H;
  }
  return href;
}

export function Link({ href, locale, ...props }: ComponentProps<typeof nav.Link>) {
  const current = useLocale();
  return createElement(nav.Link, {
    ...props,
    locale,
    href: localizeHref(href, locale ?? current),
  });
}

export const redirect: typeof nav.redirect = (args, type) =>
  nav.redirect({ ...args, href: localizeHref(args.href, args.locale) }, type);

export const getPathname: typeof nav.getPathname = (args) =>
  nav.getPathname({ ...args, href: localizeHref(args.href, args.locale) });

/** Adresse interne de la page affichée (`/pricing` quand on lit `/tarifs`). */
export function usePathname(): string {
  const pathname = nav.usePathname();
  const locale = useLocale();
  return internalPath(pathname, locale);
}

export function useRouter(): ReturnType<typeof nav.useRouter> {
  const router = nav.useRouter();
  const current = useLocale();
  return useMemo(
    () => ({
      ...router,
      push: (href, options) => router.push(localizeHref(href, options?.locale ?? current), options),
      replace: (href, options) =>
        router.replace(localizeHref(href, options?.locale ?? current), options),
      prefetch: (href, options) =>
        router.prefetch(localizeHref(href, options?.locale ?? current), options),
    }),
    [router, current],
  );
}
