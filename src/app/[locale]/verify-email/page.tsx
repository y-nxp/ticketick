import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { MailCheck, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { confirmEmailToken } from "@/lib/auth/email-verification";

// Consomme un jeton à usage unique : rien ne doit être mis en cache.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations("verifyEmail");

  const ok = token
    ? await confirmEmailToken(token).catch((error) => {
        console.error("[auth] confirmation d'adresse", error);
        return false;
      })
    : false;

  return (
    <div className="container-page max-w-md py-16">
      <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <div
          className={`mx-auto grid size-14 place-items-center rounded-2xl ${
            ok ? "bg-primary/10" : "bg-destructive/10"
          }`}
        >
          {ok ? (
            <MailCheck className="size-7 text-primary" />
          ) : (
            <TriangleAlert className="size-7 text-destructive" />
          )}
        </div>
        <h1 className="mt-4 text-2xl font-bold">
          {ok ? t("okTitle") : t("failTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {ok ? t("okBody") : t("failBody")}
        </p>
        <Link href="/account" className="mt-6 block">
          <Button className="w-full">{t("toAccount")}</Button>
        </Link>
      </div>
    </div>
  );
}
