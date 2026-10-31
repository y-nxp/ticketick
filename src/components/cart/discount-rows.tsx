"use client";

import * as React from "react";
import { previewCartDiscounts } from "@/lib/orders/payment-actions";
import type { DiscountPreview } from "@/lib/orders/discounts";
import { formatPrice } from "@/lib/utils";

export const NO_DISCOUNT: DiscountPreview = { amountCents: 0, labels: [], items: [] };

/** Rabais automatiques du panier, recalculés à chaque changement de lignes. */
export function useDiscountPreview(
  lines: { ticketTypeId: string; quantity: number; seats?: string[] }[],
  locale: string,
): DiscountPreview {
  const key = lines
    .map((l) => `${l.ticketTypeId}:${l.quantity}:${(l.seats ?? []).join("+")}`)
    .join(",");
  // Le résultat garde la clé du panier qu'il décrit : un panier changé
  // n'affiche pas le rabais de l'état précédent.
  const [state, setState] = React.useState<{ key: string; preview: DiscountPreview }>({
    key: "",
    preview: NO_DISCOUNT,
  });
  React.useEffect(() => {
    if (!key) return;
    let ignore = false;
    const wanted = key.split(",").map((part) => {
      const [ticketTypeId, quantity, seats] = part.split(":");
      return {
        ticketTypeId,
        quantity: Number(quantity),
        ...(seats ? { seats: seats.split("+") } : {}),
      };
    });
    previewCartDiscounts(wanted, locale)
      .then((next) => {
        if (!ignore) setState({ key, preview: next });
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, [key, locale]);
  return state.key === key ? state.preview : NO_DISCOUNT;
}

/** Une ligne par rabais appliqué : libellé et montant déduit. */
export function DiscountRows({
  preview,
  locale,
  fallbackLabel,
}: {
  preview: DiscountPreview;
  locale: string;
  fallbackLabel: string;
}) {
  if (preview.amountCents <= 0) return null;
  const items = preview.items?.length
    ? preview.items
    : [{ label: preview.labels.join(", "), amountCents: preview.amountCents }];
  return (
    <>
      {items.map((item, index) => (
        <div key={index} className="flex justify-between gap-3 text-primary">
          <dt className="font-medium">{item.label || fallbackLabel}</dt>
          <dd className="whitespace-nowrap font-medium">
            −{formatPrice(item.amountCents, `${locale}-CH`)}
          </dd>
        </div>
      ))}
    </>
  );
}
