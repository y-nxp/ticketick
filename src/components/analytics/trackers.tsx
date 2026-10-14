"use client";

import * as React from "react";
import type { OrganizerTags } from "@/lib/analytics/organizer-tags";
import {
  trackOrganizerPageView,
  trackPurchase,
  trackViewItem,
  type TrackedItem,
} from "@/lib/analytics/track";

/** Page d'un événement : vue pour ticketick, et page vue + vue pour l'organisateur. */
export function ViewItemTracker({
  id,
  name,
  organizer,
}: {
  id: string;
  name: string;
  organizer: OrganizerTags;
}) {
  const { metaPixelId, ga4Id } = organizer;
  React.useEffect(() => {
    const tags = { metaPixelId, ga4Id };
    trackOrganizerPageView(tags);
    trackViewItem({ id, name }, tags);
  }, [id, name, metaPixelId, ga4Id]);
  return null;
}

/** Page d'accueil `/go/…` d'un organisateur. */
export function OrganizerPageTracker({ organizer }: { organizer: OrganizerTags }) {
  const { metaPixelId, ga4Id } = organizer;
  React.useEffect(() => {
    trackOrganizerPageView({ metaPixelId, ga4Id });
  }, [metaPixelId, ga4Id]);
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
