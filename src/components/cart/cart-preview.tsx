"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Minus, Plus, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-context";
import { formatDate, formatPrice } from "@/lib/utils";

/** Contenu de l'aperçu : lignes, total et bouton Réserver. */
export function CartPreview({
  onNavigate,
  reserveInParent,
}: {
  onNavigate?: () => void;
  /** Iframe : ouvrir le checkout dans la fenêtre parente. */
  reserveInParent?: boolean;
}) {
  const t = useTranslations("cart");
  const locale = useLocale();
  const router = useRouter();
  const { lines, updateQuantity, remove, subtotalCents } = useCart();

  if (lines.length === 0) {
    return (
      <div className="p-4">
        <p className="font-semibold">{t("title")}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t("empty")}</p>
      </div>
    );
  }

  function goCheckout() {
    onNavigate?.();
    if (reserveInParent && window.top && window.top !== window) {
      const path = locale === "fr" ? "/checkout" : `/${locale}/checkout`;
      window.top.location.assign(`${window.location.origin}${path}`);
      return;
    }
    router.push("/checkout");
  }

  return (
    <div className="flex max-h-[min(28rem,70vh)] flex-col">
      <div className="border-b border-border px-4 py-3">
        <p className="font-semibold">{t("title")}</p>
      </div>
      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {lines.map((line) => (
          <li key={line.ticketTypeId} className="flex gap-3">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
              {line.coverImage ? (
                <Image
                  src={line.coverImage}
                  alt=""
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{line.eventTitle}</p>
              <p className="truncate text-xs text-muted-foreground">
                {line.ticketName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(line.sessionStartsAt, `${locale}-CH`, {
                  weekday: undefined,
                  year: undefined,
                })}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(line.ticketTypeId, line.quantity - 1)
                    }
                    className="grid size-7 place-items-center rounded-full border border-border hover:bg-secondary"
                    aria-label={t("quantity")}
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-6 text-center text-sm font-semibold tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      updateQuantity(line.ticketTypeId, line.quantity + 1)
                    }
                    className="grid size-7 place-items-center rounded-full border border-border hover:bg-secondary"
                    aria-label={t("quantity")}
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {formatPrice(
                      line.unitPriceCents * line.quantity,
                      `${locale}-CH`,
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(line.ticketTypeId)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={t("remove")}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="space-y-2 border-t border-border px-4 py-3">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">{t("total")}</span>
          <span className="font-bold">
            {formatPrice(subtotalCents, `${locale}-CH`)}
          </span>
        </div>
        <Button size="lg" className="w-full" onClick={goCheckout}>
          {t("reserve")}
        </Button>
        <Link
          href="/cart"
          onClick={onNavigate}
          className="block text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {t("viewCart")}
        </Link>
      </div>
    </div>
  );
}
