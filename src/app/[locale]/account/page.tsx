import { getTranslations, setRequestLocale } from "next-intl/server";
import { Ticket, Receipt, UserRound, LogOut, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requireAuth } from "@/lib/auth/dal";
import { logout } from "@/lib/auth/actions";
import { getMyOrders } from "@/lib/data/my-orders";
import { formatDate, formatPrice } from "@/lib/utils";
import { t as translate, type Translated } from "@/lib/types";
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
  const ta = await getTranslations("admin");
  const tAuth = await getTranslations("auth");

  // L'identifiant vient de la session : on ne consulte que ses propres
  // commandes.
  const orders = await getMyOrders(user.id);

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
            {tAuth("signOut")}
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
            <Receipt className="size-4 text-muted-foreground" />
            {t("myOrders")}
          </h2>

          {orders.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("noOrders")}
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="rounded-xl border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {order.reference}
                    </span>
                    <Badge
                      variant={
                        order.status === "PAID" ? "default" : "secondary"
                      }
                    >
                      {ta(`orderStatus.${order.status}`)}
                    </Badge>
                  </div>

                  <ul className="mt-3 space-y-1 text-sm">
                    {order.items.map((item, index) => (
                      <li key={index}>
                        {item.quantity} × {translate(
                          item.ticketType.session.event.title as Translated,
                          locale,
                        )}
                        <span className="text-muted-foreground">
                          {" — "}
                          {formatDate(
                            item.ticketType.session.startsAt,
                            `${locale}-CH`,
                            { day: "2-digit", month: "short", year: "numeric" },
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-sm">
                    <span className="font-medium tabular-nums">
                      {formatPrice(order.totalCents, locale)}
                    </span>
                    {/* Les billets n'existent qu'après confirmation du
                        paiement : une commande en attente n'en a pas. */}
                    {order.tickets.length > 0 ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Ticket className="size-3.5" />
                        {t("ticketCount", { count: order.tickets.length })}
                      </span>
                    ) : null}
                  </div>

                  {order.tickets.length > 0 ? (
                    <ul className="mt-3 flex flex-wrap gap-1.5">
                      {order.tickets.map((ticket) => (
                        <li
                          key={ticket.code}
                          className="rounded-lg bg-muted px-2 py-1 font-mono text-xs"
                        >
                          {ticket.code}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="mt-4 max-w-xl">
        <PasswordForm />
      </div>
    </div>
  );
}
