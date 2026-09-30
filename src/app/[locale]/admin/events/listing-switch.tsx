"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { setEventListed } from "@/lib/admin/event-actions";
import { cn } from "@/lib/utils";

/** Interrupteur « Publier sur ticketick » d'une ligne de la liste. */
export function ListingSwitch({
  eventId,
  listed,
  title,
}: {
  eventId: string;
  listed: boolean;
  title: string;
}) {
  const t = useTranslations("admin.events.listing");
  const [on, setOn] = React.useState(listed);
  const [pending, startTransition] = React.useTransition();
  const [failed, setFailed] = React.useState(false);

  function toggle() {
    const next = !on;
    setOn(next);
    setFailed(false);
    startTransition(async () => {
      const result = await setEventListed(eventId, next);
      if (!result?.ok) {
        setOn(!next);
        setFailed(true);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={t("aria", { title })}
        disabled={pending}
        onClick={toggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
          on ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block size-5 rounded-full bg-white shadow transition-transform",
            on ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
      <span className={cn("text-xs", failed ? "text-destructive" : "text-muted-foreground")}>
        {failed ? t("error") : t(on ? "on" : "off")}
      </span>
    </div>
  );
}
