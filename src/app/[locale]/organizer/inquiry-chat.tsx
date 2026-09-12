"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  submitOrganizerInquiry,
  type InquiryState,
} from "@/lib/organizer/inquiry-actions";

type Format = "ONE_DAY" | "MULTI_DAY" | "MULTI_SESSION" | "UNSURE";
type Etape = "format" | "details" | "email" | "phone";

const FORMATS: Format[] = ["ONE_DAY", "MULTI_DAY", "MULTI_SESSION", "UNSURE"];

/**
 * Entretien guidé plutôt qu'un formulaire d'inscription.
 *
 * Les accès organisateur ne s'ouvrent pas ici : on recueille le besoin, puis
 * un rendez-vous est proposé à la main. Présenter un bouton « créer un
 * événement » ferait croire le contraire.
 */
export function InquiryChat() {
  const t = useTranslations("organizer.chat");
  const [etape, setEtape] = React.useState<Etape>("format");
  const [format, setFormat] = React.useState<Format | null>(null);
  const [message, setMessage] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [state, action, pending] = useActionState<InquiryState, FormData>(
    submitOrganizerInquiry,
    undefined,
  );

  if (state && "ok" in state) {
    return (
      <div className="space-y-3">
        <Bulle>
          <p className="flex items-start gap-2">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            {t("thanks")}
          </p>
          <p className="mt-2 text-muted-foreground">{t("thanksHint")}</p>
        </Bulle>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Bulle>{t("hello")}</Bulle>
      <Bulle>{t("askFormat")}</Bulle>

      {format ? (
        <Bulle moi>{t(`formats.${format}`)}</Bulle>
      ) : (
        <div className="flex flex-wrap gap-2 pl-1">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => {
                setFormat(f);
                setEtape("details");
              }}
              className="rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium transition-colors hover:border-primary hover:text-primary"
            >
              {t(`formats.${f}`)}
            </button>
          ))}
        </div>
      )}

      {etape !== "format" ? <Bulle>{t("askDetails")}</Bulle> : null}

      {etape === "details" ? (
        <div className="space-y-2 pl-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={800}
            placeholder={t("detailsPlaceholder")}
            className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-ring"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setEtape("email")}>
              {t("continue")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMessage("");
                setEtape("email");
              }}
            >
              {t("skip")}
            </Button>
          </div>
        </div>
      ) : null}

      {message && etape !== "details" && etape !== "format" ? (
        <Bulle moi>{message}</Bulle>
      ) : null}

      {etape === "email" || etape === "phone" ? <Bulle>{t("askEmail")}</Bulle> : null}

      {etape === "email" ? (
        <form
          className="flex gap-2 pl-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) setEtape("phone");
          }}
        >
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("emailPlaceholder")}
            className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
          />
          <Button type="submit" size="sm">
            {t("continue")}
          </Button>
        </form>
      ) : null}

      {etape === "phone" ? <Bulle moi>{email}</Bulle> : null}

      {etape === "phone" ? (
        <>
          <Bulle>{t("askPhone")}</Bulle>
          <form action={action} className="space-y-2 pl-1">
            <input type="hidden" name="format" value={format ?? ""} />
            <input type="hidden" name="message" value={message} />
            <input type="hidden" name="email" value={email} />
            <div className="flex gap-2">
              <input
                type="tel"
                name="phone"
                required
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("phonePlaceholder")}
                className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-ring"
              />
              <Button type="submit" disabled={pending}>
                <Send className="size-4" />
                {pending ? t("pending") : t("send")}
              </Button>
            </div>
            {state && "error" in state ? (
              <p
                role="alert"
                className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
              >
                {t(state.error)}
              </p>
            ) : null}
          </form>
        </>
      ) : null}
    </div>
  );
}

function Bulle({
  children,
  moi,
}: {
  children: React.ReactNode;
  moi?: boolean;
}) {
  return (
    <div className={`flex ${moi ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-2xl px-4 py-2.5 text-sm ${
          moi
            ? "bg-primary text-primary-foreground"
            : "border border-border bg-card text-foreground"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
