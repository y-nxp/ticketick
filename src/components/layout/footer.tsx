import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Logo } from "./logo";

export function Footer() {
  const t = useTranslations("footer");
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-border/70 bg-secondary/30">
      <div className="container-page grid gap-10 py-14 md:grid-cols-4">
        <div className="space-y-3 md:col-span-1">
          <Logo />
          <p className="text-sm text-muted-foreground">
            {t("madeIn")} 🇨🇭
          </p>
        </div>

        <FooterCol title={t("about")}>
          <FooterLink href="/about">{t("about")}</FooterLink>
          <FooterLink href="/contact">{t("contact")}</FooterLink>
          <FooterLink href="/help">{t("help")}</FooterLink>
        </FooterCol>

        <FooterCol title={t("organizers")}>
          <FooterLink href="/organizer">{t("organizers")}</FooterLink>
          <FooterLink href="/help">{t("help")}</FooterLink>
        </FooterCol>

        <FooterCol title={t("terms")}>
          <FooterLink href="/terms">{t("terms")}</FooterLink>
          <FooterLink href="/privacy">{t("privacy")}</FooterLink>
        </FooterCol>
      </div>
      <div className="border-t border-border/70">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>© {year} ticketick.ch — {t("rights")}</p>
          <p>ticketick.ch · ticketick.net</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        {children}
      </Link>
    </li>
  );
}
