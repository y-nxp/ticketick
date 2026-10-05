"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, Mail, Phone } from "lucide-react";
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
  const { contactEmail: email, contactPhone: phone, contactUrl: url } = event;
  const site = url ? hostOf(url) : null;
  const note = event.contactNote ? t(event.contactNote, locale) : "";

  return (
    <div
      id="ticket-selector"
      className="scroll-mt-24 rounded-card border border-border bg-card p-5 shadow-sm"
    >
      <h3 className="text-xl font-semibold">{te("title")}</h3>
      <p className="mt-2 font-medium leading-snug">{title}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {date}
        {session.label ? ` · ${t(session.label, locale)}` : null}
      </p>
      <p className="mt-4 text-sm leading-relaxed">
        {note || (url ? te("introSite") : te("intro"))}
      </p>

      {url || email || phone ? (
        <div className="mt-4 flex flex-col gap-2">
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants(), "h-auto min-h-10 whitespace-normal")}
            >
              <ExternalLink aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                {te("site", { site: site ?? url })}
              </span>
            </a>
          ) : null}
          {email ? (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(subject)}`}
              className={cn(
                buttonVariants({ variant: url ? "outline" : "default" }),
                "h-auto min-h-10 whitespace-normal",
              )}
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
                buttonVariants({ variant: url || email ? "outline" : "default" }),
                "h-auto min-h-10",
              )}
            >
              <Phone aria-hidden />
              {phone}
            </a>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-control border border-dashed border-border p-4 text-sm text-muted-foreground">
          {te("pending")}
        </p>
      )}
    </div>
  );
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
