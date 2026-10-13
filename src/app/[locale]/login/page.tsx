import { getTranslations } from "next-intl/server";
import { MailCheck, UserRound } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { CODE_MINUTES, currentChallenge } from "@/lib/auth/second-factor";
import { CodeForm } from "./code-form";
import { LoginForm } from "./login-form";

// Le contenu dépend de la session : la page ne peut pas être mise en cache.
export const dynamic = "force-dynamic";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  const { next } = await searchParams;
  const t = await getTranslations("auth");

  // Déjà connecté : afficher un formulaire de connexion n'aurait pas de sens.
  if (await getCurrentUser()) {
    redirect({ href: next?.startsWith("/") ? next : "/account", locale });
  }

  const challenge = await currentChallenge();

  return (
    <div className="container-page max-w-md py-16">
      <div className="rounded-card border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-card bg-primary/10">
            {challenge ? (
              <MailCheck className="size-7 text-primary" />
            ) : (
              <UserRound className="size-7 text-primary" />
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold">
            {challenge ? t("code.title") : t("signIn")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {challenge
              ? t("code.subtitle", { email: challenge.user.email, minutes: CODE_MINUTES })
              : t("signInSubtitle")}
          </p>
        </div>

        {challenge ? <CodeForm /> : <LoginForm next={next} />}
      </div>
    </div>
  );
}
