import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="container-page py-24">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-card bg-primary/10">
          <SearchX className="size-7 text-primary" />
        </div>
        <h1 className="mt-5 text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("body")}</p>
        <Link href="/" className={buttonVariants({ className: "mt-8" })}>
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
