"use client";

import { useTranslations } from "next-intl";
import { UserPlus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { readBuyer } from "@/lib/checkout/buyer";

/** Invitation à créer un compte après un achat sans compte. */
export function AccountInvite() {
  const t = useTranslations("checkout");
  const router = useRouter();

  function open() {
    const buyer = readBuyer();
    const query: Record<string, string> = { next: "/account" };
    if (buyer?.email) query.email = buyer.email;
    if (buyer?.firstName) query.firstName = buyer.firstName;
    if (buyer?.lastName) query.lastName = buyer.lastName;
    router.push({ pathname: "/register", query });
  }

  return (
    <div className="mt-10 rounded-card border border-border bg-card p-5 text-left">
      <h2 className="text-lg font-semibold">{t("accountInviteTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("accountInviteText")}
      </p>
      <Button type="button" variant="outline" className="mt-4" onClick={open}>
        <UserPlus className="size-4" />
        {t("accountInviteCta")}
      </Button>
    </div>
  );
}
