import { getTranslations } from "next-intl/server";
import { KeyRound } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { ForgotForm } from "./forgot-form";

// Dépend de la session : jamais mise en cache.
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const { locale } = await params;
  const { email } = await searchParams;
  const t = await getTranslations("auth.forgot");

  // Déjà connecté : le changement de mot de passe se fait depuis le compte,
  // sans passer par un lien envoyé par courriel.
  if (await getCurrentUser()) {
    redirect({ href: "/account", locale });
  }

  return (
    <div className="container-page max-w-md py-16">
      <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10">
            <KeyRound className="size-7 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>

        <ForgotForm defaultEmail={email} />
      </div>
    </div>
  );
}
