"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ShoppingBasket, TicketCheck, X } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatPrice } from "@/lib/utils";
import { partCount, partTotal, usePosCart } from "./pos-cart";

/**
 * Vente en cours sur la liste des concerts : ce qui est déjà choisi, et le
 * passage à l'encaissement (sur le dernier concert ajouté, repris tel quel).
 */
export function PosCartBanner({ agentId, locale }: { agentId: string; locale: string }) {
  const t = useTranslations("pos.sell.cart");
  const cart = usePosCart(agentId);
  if (cart.parts.length === 0) return null;
  const count = cart.parts.reduce((n, p) => n + partCount(p), 0);
  const total = cart.parts.reduce((n, p) => n + partTotal(p), 0);
  const last = cart.parts.at(-1)!;

  return (
    <section className="rounded-card border border-primary/40 bg-primary/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            <ShoppingBasket className="size-4" aria-hidden />
            {t("bannerTitle", { count, concerts: cart.parts.length })}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("bannerHint")}</p>
        </div>
        <span className="font-semibold tabular-nums">{formatPrice(total, `${locale}-CH`)}</span>
      </div>
      <ul className="mt-3 divide-y divide-border text-sm">
        {cart.parts.map((part) => (
          <li key={part.sessionId} className="flex items-start gap-3 py-2">
            <Link href={`/pos/sell/${part.sessionId}`} className="min-w-0 flex-1 hover:text-primary">
              <span className="block font-medium">{part.title}</span>
              <span className="block text-xs text-muted-foreground">
                {part.when} · {part.lines.map((l) => `${l.quantity} × ${l.name}`).join(" · ")}
              </span>
            </Link>
            <span className="shrink-0 tabular-nums">{formatPrice(partTotal(part), `${locale}-CH`)}</span>
            <button
              type="button"
              onClick={() => cart.remove(part.sessionId)}
              aria-label={t("remove", { title: part.title })}
              className="shrink-0 rounded-control p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
            >
              <X className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap justify-end gap-3">
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t("confirmClear"))) cart.clear();
          }}
          className={buttonVariants({ variant: "outline" })}
        >
          {t("clear")}
        </button>
        <Link href={`/pos/sell/${last.sessionId}`} className={buttonVariants()}>
          <TicketCheck className="size-4" />
          {t("checkout")}
        </Link>
      </div>
    </section>
  );
}
