import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { LogIn, XCircle } from "lucide-react";
import { ChangeScreen } from "@/components/change/change-screen";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { changePageData } from "@/lib/orders/seat-change";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

const CONTACT = "ticket@ticketick.ch";

export default async function ChangePage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("change");
  const user = await getCurrentUser();
  const data = await changePageData({ token, userId: user?.id ?? null });
  if (data.state === "invalid") notFound();

  // Commande liée à un compte : le lien seul ne suffit pas.
  if (data.state === "login") {
    const here = `/change/${encodeURIComponent(token)}`;
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-xl rounded-card border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-primary/10">
            <LogIn className="size-7 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl">{t("loginTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user ? t("otherAccount", { email: user.email }) : t("loginText")}
          </p>
          {user ? null : (
            <Link href={`/login?next=${encodeURIComponent(here)}`} className="mt-6 block">
              <Button size="lg" className="w-full">
                {t("loginButton")}
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (data.state !== "open") {
    return (
      <div className="container-page py-12">
        <div className="mx-auto max-w-xl rounded-card border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-muted">
            <XCircle className="size-7 text-muted-foreground" />
          </div>
          <h1 className="mt-4 text-2xl">{t("expiredTitle")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("expiredText", { contact: CONTACT })}
          </p>
          <p className="mt-4 text-sm">
            <a
              href={`mailto:${CONTACT}?subject=${encodeURIComponent(data.reference)}`}
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {CONTACT}
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl">{t("title")}</h1>
        <ChangeScreen
          data={data}
          access={{ token }}
          locale={locale}
          invite={data.inviteAccount && !user}
        />
      </div>
    </div>
  );
}
