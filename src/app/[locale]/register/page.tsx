import { getTranslations } from "next-intl/server";
import { UserPlus } from "lucide-react";
import { redirect } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    next?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  }>;
}) {
  const { locale } = await params;
  const { next, email, firstName, lastName } = await searchParams;
  const t = await getTranslations("auth");

  if (await getCurrentUser()) {
    redirect({ href: next?.startsWith("/") ? next : "/account", locale });
  }

  return (
    <div className="container-page max-w-md py-16">
      <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10">
            <UserPlus className="size-7 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">{t("signUp")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("signUpSubtitle")}
          </p>
        </div>

        <RegisterForm
          next={next}
          defaultEmail={email}
          defaultFirstName={firstName}
          defaultLastName={lastName}
        />
      </div>
    </div>
  );
}
