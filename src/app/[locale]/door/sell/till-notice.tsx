import { getTranslations } from "next-intl/server";
import { Store } from "lucide-react";

/** Rappel permanent : caisse de vente sur place, billets papier. */
export async function TillNotice() {
  const t = await getTranslations("door.sell");
  return (
    <p className="flex items-start gap-2 rounded-card border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <Store className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>
        <span className="font-medium">{t("noticeTitle")}</span> {t("notice")}
      </span>
    </p>
  );
}
