"use client";

import * as React from "react";
import { trackPurchase, trackViewItem, type TrackedItem } from "@/lib/analytics/track";

export function ViewItemTracker({ id, name }: { id: string; name: string }) {
  React.useEffect(() => {
    trackViewItem({ id, name });
  }, [id, name]);
  return null;
}

export function PurchaseTracker(props: {
  reference: string;
  valueCents: number;
  currency: string;
  items: TrackedItem[];
  paymentType: string;
}) {
  const sent = React.useRef(false);
  React.useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackPurchase(props);
  }, [props]);
  return null;
}
