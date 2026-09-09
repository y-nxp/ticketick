"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Minus, Plus, Trash2, ShoppingBag, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-context";
import { formatPrice } from "@/lib/utils";

const SERVICE_FEE_RATE = 0.05;

export default function CartPage() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const { lines, updateQuantity, remove, subtotalCents } = useCart();

  const fee = Math.round(subtotalCents * SERVICE_FEE_RATE);
  const total = subtotalCents + fee;

  if (lines.length === 0) {
    return (
      <div className="container-page py-20 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-secondary">
          <ShoppingBag className="size-7 text-muted-foreground" />
        </div>
        <h1 className="mt-6 text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("empty")}</p>
        <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
        <Link href="/" className="mt-6 inline-block">
          <Button size="lg">{t("browse")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {lines.map((line) => (
            <div
              key={line.ticketTypeId}
              className="flex gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div className="relative size-20 shrink-0 overflow-hidden rounded-xl">
                <Image
                  src={line.coverImage}
                  alt={line.eventTitle}
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <Link
                  href={`/events/${line.eventSlug}`}
                  className="truncate font-semibold hover:text-primary"
                >
                  {line.eventTitle}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {line.ticketName}
                </p>
                <p className="mt-1 text-sm font-medium">
                  {formatPrice(line.unitPriceCents, `${locale}-CH`)}
                </p>
                <div className="mt-auto flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        updateQuantity(line.ticketTypeId, line.quantity - 1)
                      }
                      className="grid size-8 place-items-center rounded-full border border-border hover:bg-secondary"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-8 text-center font-semibold tabular-nums">
                      {line.quantity}
                    </span>
                    <button
                      onClick={() =>
                        updateQuantity(line.ticketTypeId, line.quantity + 1)
                      }
                      className="grid size-8 place-items-center rounded-full border border-border hover:bg-secondary"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <button
                    onClick={() => remove(line.ticketTypeId)}
                    className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    {t("remove")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("title")}</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("subtotal")}</dt>
                <dd>{formatPrice(subtotalCents, `${locale}-CH`)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("serviceFee")}</dt>
                <dd>{formatPrice(fee, `${locale}-CH`)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <dt>{t("total")}</dt>
                <dd>{formatPrice(total, `${locale}-CH`)}</dd>
              </div>
            </dl>
            <Link href="/checkout" className="mt-5 block">
              <Button size="lg" className="w-full">
                {t("checkout")}
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            <Link href="/" className="mt-2 block">
              <Button variant="ghost" className="w-full">
                {t("continue")}
              </Button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
