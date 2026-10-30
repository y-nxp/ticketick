"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { CheckCircle2, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeSalesAlert } from "@/lib/sales-alerts/actions";
import { formatDate } from "@/lib/utils";
import { t, type EventItem, type SessionItem } from "@/lib/types";

/**
 * Remplace le choix des billets quand l'organisateur a suspendu la vente :
 * la fiche reste en ligne et le visiteur peut laisser son adresse pour être
 * prévenu de la reprise.
 */
export function PausedBooking({
  event,
  session,
  locale,
}: {
  event: EventItem;
  session: SessionItem;
  locale: string;
}) {
  const te = useTranslations("event.paused");
  const [state, action, pending] = React.useActionState(subscribeSalesAlert, undefined);
  const done = state && "ok" in state;
  const error = state && "error" in state ? state.error : null;

  return (
    <div
      id="ticket-selector"
      className="scroll-mt-24 rounded-card border border-border bg-card p-5 shadow-sm"
    >
      <h3 className="flex items-center gap-2 text-xl font-semibold">
        <PauseCircle className="size-5 shrink-0 text-primary" aria-hidden />
        {te("title")}
      </h3>
      <p className="mt-2 font-medium leading-snug">{t(event.title, locale)}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {formatDate(session.startsAt, `${locale}-CH`)}
        {session.label ? ` · ${t(session.label, locale)}` : null}
      </p>
      <p className="mt-4 text-sm leading-relaxed">{te("text")}</p>

      {done ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-control bg-secondary p-3 text-sm"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          {te("done")}
        </p>
      ) : (
        <form action={action} className="mt-4 space-y-2">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="locale" value={locale} />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{te("email")}</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              maxLength={200}
              aria-invalid={error === "email" || undefined}
              className="h-11 rounded-control border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
            />
          </label>
          <Button type="submit" className="w-full" disabled={pending}>
            {te("submit")}
          </Button>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {te(`errors.${error}`)}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">{te("privacy")}</p>
        </form>
      )}
    </div>
  );
}
