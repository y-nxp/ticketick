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
 * visite, elle reste posée en bas sans bloquer la page jusqu'à la réponse ;
 * rouverte depuis le pied de page, elle passe au centre et se ferme par Échap.
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

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (reopened && !dialog.open) dialog.showModal();
    if (!reopened && dialog.open) dialog.close();
  }, [reopened]);

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

  const panel = "max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-card border border-border bg-card p-5 text-sm text-foreground shadow-2xl";

  const content = (
    <>
      <div className="flex items-center justify-between gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/ticketick-logo-small.svg?v=2" alt="ticketick" width={601} height={73} className="h-4 w-auto dark:hidden" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/ticketick-logo-small-inverse.svg?v=2"
          alt="ticketick"
          width={601}
          height={73}
          className="hidden h-4 w-auto dark:block"
        />
        <div className="-mr-3">
          <LanguageSwitcher />
        </div>
      </div>

      <h2 id="consent-title" className="mt-2 font-semibold">
        {t("title")}
      </h2>
      <p className="mt-1 leading-relaxed text-muted-foreground">
        {t("text")}{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          {t("learnMore")}
        </Link>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => choose(ALL_GRANTED)}>
          {t("acceptAll")}
        </Button>
        <Button size="sm" onClick={() => choose(ALL_DENIED)}>
          {t("decline")}
        </Button>
      </div>

      <button
        type="button"
        aria-expanded={details}
        onClick={() => setDetails((v) => !v)}
        className="mx-auto mt-2 flex items-center gap-1 py-1 text-xs font-medium text-primary hover:underline"
      >
        {t("customize")}
        <ChevronDown className={cn("size-3.5 transition-transform", details && "rotate-180")} aria-hidden />
      </button>

      {details ? (
        <div className="mt-2 divide-y divide-border border-t border-border">
          <Category title={t("base.title")} text={t("base.text")}>
            <span className="text-xs text-muted-foreground">{t("alwaysOn")}</span>
          </Category>
          {CHOICES.map((choice) => (
            <Category key={choice} title={t(`${choice}.title`)} text={t(`${choice}.text`)}>
              <Switch checked={draft[choice]} onChange={() => toggle(choice)} label={t(`${choice}.title`)} />
            </Category>
          ))}
          <div className="pt-3">
            <Button size="sm" className="w-full" onClick={() => choose(draft)}>
              {t("save")}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <>
      {open && !reopened ? (
        <section
          aria-labelledby="consent-title"
          className={cn(panel, "fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md sm:right-auto sm:left-4 sm:mx-0 sm:w-md")}
        >
          {content}
        </section>
      ) : null}
      <dialog
        ref={ref}
        aria-labelledby={reopened ? "consent-title" : undefined}
        onCancel={() => setReopened(false)}
        className={cn(panel, "m-auto w-[calc(100%-1.5rem)] max-w-md backdrop:bg-black/40")}
      >
        {reopened ? content : null}
      </dialog>
    </>
  );
}

function Category({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{title}</span>
        {children}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted-foreground/30",
      )}
    >
      <span
        className={cn(
          "inline-block size-4 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}
