"use client";

import { useTranslations } from "next-intl";
import { stopImpersonation } from "@/lib/auth/admin-actions";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const t = useTranslations("admin.impersonation");

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
      <p className="text-sm">
        {t("banner", { name, email })}
      </p>
      <form action={stopImpersonation}>
        <Button type="submit" size="sm" variant="outline">
          {t("back")}
        </Button>
      </form>
    </div>
  );
}
