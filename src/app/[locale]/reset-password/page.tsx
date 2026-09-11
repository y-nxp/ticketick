import { getTranslations } from "next-intl/server";
import { KeyRound, TriangleAlert } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { resetTokenUsable } from "@/lib/auth/reset-actions";
import { ResetForm } from "./reset-form";

// Dépend d'un jeton à usage unique : rien ne doit être mis en cache.
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations("auth.reset");

  // Le jeton est contrôlé avant d'afficher le formulaire, mais sans être
  // consommé : ouvrir le lien ne doit pas l'user. La vérification décisive
  // reste celle de l'action, qui seule marque le jeton comme employé.
  const utilisable = token ? await resetTokenUsable(token) : false;

  return (
    <div className="container-page max-w-md py-16">
      <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div
            className={`mx-auto grid size-14 place-items-center rounded-2xl ${
              utilisable ? "bg-primary/10" : "bg-destructive/10"
            }`}
          >
            {utilisable ? (
              <KeyRound className="size-7 text-primary" />
            ) : (
              <TriangleAlert className="size-7 text-destructive" />
            )}
          </div>
          <h1 className="mt-4 text-2xl font-bold">
            {utilisable ? t("title") : t("expiredTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {utilisable ? t("subtitle") : t("expiredBody")}
          </p>
        </div>

        {utilisable ? (
          <ResetForm token={token as string} />
        ) : (
          <Link href="/forgot-password" className="block">
            <Button className="w-full">{t("askAgain")}</Button>
          </Link>
        )}
      </div>
    </div>
  );
}
