"use client";

import { useTranslations } from "next-intl";
import { Mail, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { t, type EventItem, type SessionItem } from "@/lib/types";

/**
 * Remplace le choix des billets quand l'entrée se fait sur inscription
 * auprès de l'organisateur (conférence, rencontre) : aucune vente ici.
 */
export function ContactBooking({
  event,
  session,
  locale,
}: {
  event: EventItem;
  session: SessionItem;
  locale: string;
}) {
  const te = useTranslations("event.contact");
  const title = t(event.title, locale);
  const date = formatDate(session.startsAt, `${locale}-CH`);
  const subject = te("subject", { title, date });
  const { contactEmail: email, contactPhone: phone } = event;

  return (
    <div
      id="ticket-selector"
      className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 shadow-sm"
    >
      <h3 className="text-xl font-semibold">{te("title")}</h3>
      <p className="mt-2 font-medium leading-snug">{title}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {date}
        {session.label ? ` · ${t(session.label, locale)}` : null}
      </p>
      <p className="mt-4 text-sm leading-relaxed">{te("intro")}</p>

      {email || phone ? (
        <div className="mt-4 flex flex-col gap-2">
          {email ? (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
              className={cn(buttonVariants(), "h-auto min-h-10 whitespace-normal")}
            >
              <Mail aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {email.slice(0, email.indexOf("@") + 1)}
                <wbr />
                {email.slice(email.indexOf("@") + 1)}
              </span>
            </a>
          ) : null}
          {phone ? (
            <a
              href={`tel:${phone.replace(/[^\d+]/g, "")}`}
              className={cn(
                buttonVariants({ variant: email ? "outline" : "default" }),
                "h-auto min-h-10",
              )}
            >
              <Phone aria-hidden />
              {phone}
            </a>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {te("pending")}
        </p>
      )}
    </div>
  );
}
