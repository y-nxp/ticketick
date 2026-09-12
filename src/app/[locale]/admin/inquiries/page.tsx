import { getTranslations, setRequestLocale } from "next-intl/server";
import { MessageSquare } from "lucide-react";
import { getAdminInquiries } from "@/lib/data/admin";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminInquiriesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const inquiries = await getAdminInquiries();
  const t = await getTranslations("admin.inquiries");

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("subtitle", { count: inquiries.length })}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">{t("hint")}</p>

      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-semibold">{t("when")}</th>
              <th className="px-4 py-3 font-semibold">{t("email")}</th>
              <th className="px-4 py-3 font-semibold">{t("phone")}</th>
              <th className="px-4 py-3 font-semibold">{t("format")}</th>
              <th className="px-4 py-3 font-semibold">{t("message")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {inquiries.map((row) => (
              <tr key={row.id} className="align-top hover:bg-muted/30">
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {formatDate(row.createdAt, `${locale}-CH`, {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={`mailto:${row.email}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {row.email}
                  </a>
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <a href={`tel:${row.phone}`} className="hover:underline">
                    {row.phone}
                  </a>
                </td>
                <td className="px-4 py-3">{t(`formats.${row.format}`)}</td>
                <td className="max-w-xs px-4 py-3 text-muted-foreground">
                  {row.message ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {inquiries.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <MessageSquare className="size-4" />
            {t("empty")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
