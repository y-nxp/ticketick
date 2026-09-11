import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAdminUsers } from "@/lib/data/admin";
import { getCurrentUser } from "@/lib/auth/dal";
import { formatDate } from "@/lib/utils";
import { UserRow } from "./user-row";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [users, me] = await Promise.all([getAdminUsers(), getCurrentUser()]);
  const t = await getTranslations("admin");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("users.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("users.subtitle", { count: users.length })}
      </p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("users.account")}</th>
              <th className="px-4 py-3 font-semibold">{t("users.role")}</th>
              <th className="px-4 py-3 font-semibold">{t("users.state")}</th>
              <th className="px-4 py-3 font-semibold">
                {t("users.lastLogin")}
              </th>
              <th className="px-4 py-3 text-right font-semibold">
                {t("users.sessions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <UserRow
                key={user.id}
                user={{
                  id: user.id,
                  email: user.email,
                  name: user.name,
                  role: user.role,
                  active: user.active,
                  isSelf: user.id === me?.id,
                  lastLogin: user.lastLoginAt
                    ? formatDate(user.lastLoginAt, `${locale}-CH`, {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "—",
                  sessions: user._count.sessions,
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{t("users.hint")}</p>
    </div>
  );
}
