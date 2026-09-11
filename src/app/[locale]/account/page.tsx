import { getTranslations, setRequestLocale } from "next-intl/server";
import { Ticket, Receipt, UserRound, LogOut, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireAuth } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { PasswordForm } from "./password-form";

// Dépend de la session : jamais mise en cache.
export const dynamic = "force-dynamic";

export default async function AccountPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await requireAuth("/account");
  const t = await getTranslations("account");
  const ta = await getTranslations("auth");

  return (
    <div className="container-page py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("welcome")}
            {user.name ? `, ${user.name}` : ""}
          </p>
        </div>

        {/* Déconnexion par formulaire : l'action serveur supprime la session
            en base, ce qu'un simple lien ne pourrait pas faire. */}
        <form action={logout}>
          <Button type="submit" variant="outline">
            <LogOut className="size-4" />
            {ta("signOut")}
          </Button>
        </form>
      </div>

      {user.role === "ADMIN" ? (
        <Link href="/admin" className="mt-8 block">
          <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
            <ShieldCheck className="size-5 text-primary" />
            <div>
              <p className="font-medium">{t("adminAccess")}</p>
              <p className="text-sm text-muted-foreground">
                {t("adminAccessHint")}
              </p>
            </div>
          </div>
        </Link>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <UserRound className="size-4 text-muted-foreground" />
            {t("profile")}
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">{t("email")}</dt>
              <dd className="font-medium">{user.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("role")}</dt>
              <dd>
                <Badge variant="secondary">{t(`roles.${user.role}`)}</Badge>
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="flex items-center gap-2 font-semibold">
            <Ticket className="size-4 text-muted-foreground" />
            {t("myTickets")}
          </h2>
          {/* Les commandes ne sont pas encore enregistrées : afficher un
              tableau vide serait plus trompeur que de le dire. */}
          <p className="mt-4 text-sm text-muted-foreground">{t("noTickets")}</p>

          <h2 className="mt-6 flex items-center gap-2 font-semibold">
            <Receipt className="size-4 text-muted-foreground" />
            {t("myOrders")}
          </h2>
          <p className="mt-4 text-sm text-muted-foreground">{t("noOrders")}</p>
        </section>
      </div>

      <div className="mt-4 max-w-xl">
        <PasswordForm />
      </div>
    </div>
  );
}
