"use client";

import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCart } from "@/components/cart/cart-context";

export function CartButton() {
  const t = useTranslations("nav");
  const { count } = useCart();

  return (
    <Link
      href="/cart"
      aria-label={t("cart")}
      className="relative inline-flex size-10 items-center justify-center rounded-full hover:bg-secondary/70 transition-colors"
    >
      <ShoppingBag className="size-5" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-5 h-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
          {count}
        </span>
      )}
    </Link>
  );
}
