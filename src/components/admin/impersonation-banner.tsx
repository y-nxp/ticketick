"use client";

import { useTranslations } from "next-intl";
import { stopImpersonation } from "@/lib/auth/admin-actions";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner({
  name,
  email,
  note,
}: {
  name: string;
  email: string;
  note?: string;
}) {
  const t = useTranslations("admin.impersonation");

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="text-sm">
        <p>{t("banner", { name, email })}</p>
        {note ? <p className="mt-0.5 text-muted-foreground">{note}</p> : null}
      </div>
      <form action={stopImpersonation}>
        <Button type="submit" size="sm" variant="outline">
          {t("back")}
        </Button>
      </form>
    </div>
  );
}
