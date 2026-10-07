import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { catalogActor } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import { ResellerForm } from "../reseller-form";

export const dynamic = "force-dynamic";

export default async function NewResellerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { organizerId } = await catalogActor();
  const t = await getTranslations("admin.resellers");
  const organizers =
    organizerId == null
      ? await prisma.organizer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
      : null;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/resellers" className="hover:text-foreground">
            {t("back")}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl">{t("newTitle")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("newIntro")}</p>
      </header>
      <ResellerForm organizers={organizers} />
    </div>
  );
}
