"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import {
  ALL_DENIED,
  ALL_GRANTED,
  CONSENT_OPEN_EVENT,
  writeConsentCookie,
  type Consent,
} from "@/lib/analytics/consent";
import { cn } from "@/lib/utils";

type Choice = keyof Consent;
const CHOICES: Choice[] = ["statistics", "ads", "personalization"];

/**
 * Fenêtre de choix des cookies. Accepter et refuser ont le même poids ; le
 * détail part de tout refusé, et non de cases pré-cochées. À la première
 * visite, elle ne se ferme que par un choix.
 */
export function ConsentDialog({ open, current }: { open: boolean; current: Consent | null }) {
  const t = useTranslations("consent");
  const ref = React.useRef<HTMLDialogElement>(null);
  const [reopened, setReopened] = React.useState(false);
  const [details, setDetails] = React.useState(false);
  const [draft, setDraft] = React.useState<Consent>(current ?? ALL_DENIED);

  const currentRef = React.useRef(current);
  React.useEffect(() => {
    currentRef.current = current;
  }, [current]);

  React.useEffect(() => {
    const onOpen = () => {
      setDraft(currentRef.current ?? ALL_DENIED);
      setDetails(true);
      setReopened(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, []);

  const visible = open || reopened;
  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (visible && !dialog.open) dialog.showModal();
    if (!visible && dialog.open) dialog.close();
  }, [visible]);

  const choose = (consent: Consent) => {
    setReopened(false);
    setDetails(false);
    writeConsentCookie(consent);
  };

  const toggle = (choice: Choice) =>
    setDraft((d) => {
      const next = { ...d, [choice]: !d[choice] };
      if (choice === "ads" && !next.ads) next.personalization = false;
      if (choice === "personalization" && next.personalization) next.ads = true;
      return next;
    });

  return (
    <dialog
      ref={ref}
      aria-labelledby="consent-title"
      onCancel={(e) => {
        if (!reopened) e.preventDefault();
        else setReopened(false);
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-card border border-border bg-card p-0 text-sm text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 sm:px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ticketick-logo-small.svg?v=2" alt="ticketick" width={601} height={73} className="h-5 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/ticketick-logo-small-inverse.svg?v=2"
          alt="ticketick"
          width={601}
          height={73}
          className="hidden h-5 w-auto dark:block"
        />
        <LanguageSwitcher />
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6">
        <div>
          <h2 id="consent-title" className="text-base font-semibold">
            {t("title")}
          </h2>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            {t("text")}{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              {t("learnMore")}
            </Link>
          </p>
        </div>

        <div className="grid gap-2">
          <Button className="w-full" onClick={() => choose(ALL_GRANTED)}>
            {t("acceptAll")}
          </Button>
          <Button className="w-full" onClick={() => choose(ALL_DENIED)}>
            {t("decline")}
          </Button>
        </div>

        <div className="rounded-control bg-secondary/60">
          <button
            type="button"
            aria-expanded={details}
            onClick={() => setDetails((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 px-4 py-2.5 font-medium text-primary"
          >
            {t("customize")}
            <ChevronDown className={cn("size-4 transition-transform", details && "rotate-180")} aria-hidden />
          </button>

          {details ? (
            <div className="divide-y divide-border px-4 pb-4">
              <Category title={t("base.title")} text={t("base.text")}>
                <Switch checked disabled label={t("base.title")} />
                <span className="text-xs text-muted-foreground">{t("alwaysOn")}</span>
              </Category>
              {CHOICES.map((choice) => (
                <Category key={choice} title={t(`${choice}.title`)} text={t(`${choice}.text`)}>
                  <Switch checked={draft[choice]} onChange={() => toggle(choice)} label={t(`${choice}.title`)} />
                </Category>
              ))}
              <div className="pt-4">
                <Button className="w-full" onClick={() => choose(draft)}>
                  {t("save")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}

function Category({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(true);
  return (
    <div className="py-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left font-semibold"
      >
        {title}
        <ChevronDown className={cn("size-4 shrink-0 text-primary transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open ? <p className="mt-1.5 leading-relaxed text-muted-foreground">{text}</p> : null}
      <div className="mt-2.5 flex items-center gap-2">{children}</div>
    </div>
  );
}

function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        disabled && "opacity-60",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
