"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { ChannelPreview } from "@/components/admin/promotion/previews";
import { Field, FormFeedback, TextInput } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { createPromotion } from "@/lib/admin/promotion-actions";
import type { FormState } from "@/lib/admin/types";
import type { ComposerData } from "@/lib/data/promotion";
import { campaignLink, PROMOTION_CHANNELS, type PromotionChannel } from "@/lib/promotion/channels";
import {
  PROMOTION_LOCALES,
  promotionBody,
  promotionMessage,
  type PromotionLocale,
} from "@/lib/promotion/template";
import { t as translate } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const ALL_DATES = "";

function splitTags(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function Composer({ data, uiLocale }: { data: ComposerData; uiLocale: string }) {
  const t = useTranslations("admin.promotion");
  const router = useRouter();
  const { event, sessions, accounts, promotability: rules } = data;
  const [state, action, pending] = useActionState<FormState, FormData>(createPromotion, undefined);

  const [sessionId, setSessionId] = React.useState(data.defaultSessionId ?? ALL_DATES);
  const [locale, setLocale] = React.useState<PromotionLocale>(
    (PROMOTION_LOCALES as readonly string[]).includes(uiLocale) ? (uiLocale as PromotionLocale) : "fr",
  );
  const [landing, setLanding] = React.useState<"go" | "events">("go");
  const [selected, setSelected] = React.useState<string[]>(
    accounts.filter((a) => a.status === "ACTIVE").map((a) => a.id),
  );
  const [image, setImage] = React.useState(event.images[0] ?? "");
  // `null` : texte et nom suivent le gabarit ; dès la première retouche, ils
  // ne bougent plus tant qu'on ne demande pas à les régénérer.
  const [customBody, setCustomBody] = React.useState<string | null>(null);
  const [customName, setCustomName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (state?.ok) router.push("/admin/promotion");
  }, [state, router]);

  const chosen = sessionId ? sessions.filter((s) => s.id === sessionId) : sessions;
  const title = translate(event.title, locale);
  const generatedBody = promotionBody({
    locale,
    title,
    subtitle: event.subtitle ? translate(event.subtitle, locale) : null,
    sessions: chosen,
    priceCents: sessionId ? (chosen[0]?.priceCents ?? 0) : data.allDatesPriceCents,
    tags: splitTags(event.tags ? translate(event.tags, locale) : undefined),
  });
  const body = customBody ?? generatedBody;
  const sessionText = (s: (typeof sessions)[number]) =>
    [
      formatDate(s.startsAt, `${uiLocale}-CH`),
      s.label ? translate(s.label, uiLocale) : null,
      s.venue ? `${s.venue.name}, ${s.venue.city}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  const day = (iso: string) =>
    formatDate(iso, `${uiLocale}-CH`, { weekday: undefined, hour: undefined, minute: undefined });
  const generatedName = `${title} — ${sessionId && chosen[0] ? day(chosen[0].startsAt) : t("composer.allDates")}`;
  const name = customName ?? generatedName;

  const activeAccounts = accounts.filter((a) => a.status === "ACTIVE");
  const chosenAccounts = accounts.filter((a) => selected.includes(a.id));
  const previewChannels: PromotionChannel[] = chosenAccounts.length
    ? PROMOTION_CHANNELS.filter((c) => chosenAccounts.some((a) => a.channel === c))
    : [...PROMOTION_CHANNELS];
  const messageFor = (channel: PromotionChannel) =>
    promotionMessage({
      body,
      channel,
      link: campaignLink(data.origin, data.codePlaceholder, channel),
      locale,
      onlineSale: event.onlineSale,
    });

  const arrival = data.arrival[locale];
  const arrivalPath = landing === "events" && arrival.events ? arrival.events : arrival.go;
  const reasons = rules.blockers.map((b) => t(`blockers.${b}`)).join(", ");
  const canSubmit = rules.preparable && selected.length > 0 && !pending;

  if (!rules.preparable) {
    return (
      <p className="rounded-card border border-border bg-card p-6 text-sm text-muted-foreground">
        {t("composer.notPreparable", { reasons })}
      </p>
    );
  }

  return (
    <form
      // Soumission manuelle : une action de formulaire viderait la saisie si
      // l'enregistrement est refusé.
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const form = new FormData(e.currentTarget, submitter);
        React.startTransition(() => action(form));
      }}
      className="space-y-6"
    >
      <input type="hidden" name="eventId" value={event.id} />

      {!rules.promotable ? (
        <p role="status" className="rounded-control bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-800 dark:text-amber-200">
          {t("section.notPromotable", { reasons })} {t("section.draftOnly")}
        </p>
      ) : null}
      {!event.onlineSale ? (
        <p role="status" className="rounded-control bg-secondary px-3.5 py-2.5 text-sm">
          {t("section.noAttribution")}
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5 rounded-card border border-border bg-card p-6">
          <Field label={t("composer.session")} hint={t("composer.sessionHint")}>
            <select
              name="sessionId"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionText(s)}
                </option>
              ))}
              <option value={ALL_DATES}>{t("composer.allDates")}</option>
            </select>
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">{t("composer.channels")}</legend>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("composer.channelsHint", { organizer: event.organizerName })}
            </p>
            {accounts.length === 0 ? (
              <div className="mt-2 rounded-control border border-dashed border-border p-4 text-sm">
                <p className="font-medium">{t("composer.noAccount")}</p>
                <p className="mt-1 text-muted-foreground">{t("composer.noAccountHint")}</p>
                <Link href="/admin/promotion/comptes" className="mt-2 inline-block text-primary hover:underline">
                  {t("composer.accountsLink")}
                </Link>
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="accountId"
                        value={a.id}
                        disabled={a.status !== "ACTIVE"}
                        checked={selected.includes(a.id)}
                        onChange={(e) =>
                          setSelected((ids) =>
                            e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id),
                          )
                        }
                      />
                      <span className="font-medium">{t(`channel.${a.channel}`)}</span>
                      <span className="text-muted-foreground">
                        {a.name}
                        {a.username ? ` (@${a.username})` : ""}
                      </span>
                      {a.status !== "ACTIVE" ? (
                        <span className="text-xs text-destructive">{t(`accounts.status.${a.status}`)}</span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {accounts.length > 0 && activeAccounts.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("composer.noActiveAccount")}</p>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("composer.language")} hint={t("composer.languageHint")}>
              <select
                name="locale"
                value={locale}
                onChange={(e) => setLocale(e.target.value as PromotionLocale)}
                className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
              >
                {PROMOTION_LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {t(`composer.languages.${l}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("composer.landing")} hint={t("composer.arrival", { path: arrivalPath })}>
              <select
                name="landing"
                value={landing}
                onChange={(e) => setLanding(e.target.value as "go" | "events")}
                className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
              >
                <option value="go">{t("composer.landingGo")}</option>
                {arrival.events ? <option value="events">{t("composer.landingEvents")}</option> : null}
              </select>
            </Field>
          </div>

          <Field label={t("composer.name")} hint={t("composer.nameHint")}>
            <input
              name="name"
              value={name}
              maxLength={120}
              required
              onChange={(e) => setCustomName(e.target.value)}
              className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm"
            />
          </Field>

          <div>
            <div className="flex items-end justify-between gap-3">
              <label htmlFor="promotion-body" className="text-sm font-medium">
                {t("composer.text")}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={customBody === null && customName === null}
                onClick={() => {
                  setCustomBody(null);
                  setCustomName(null);
                }}
              >
                <RefreshCw />
                {t("composer.regenerate")}
              </Button>
            </div>
            <textarea
              id="promotion-body"
              name="body"
              rows={12}
              value={body}
              onChange={(e) => setCustomBody(e.target.value)}
              className="mt-1.5 w-full rounded-control border border-border bg-background p-3 text-sm outline-none focus:border-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground">{t("composer.textHint")}</p>
          </div>

          <fieldset>
            <legend className="text-sm font-medium">{t("composer.image")}</legend>
            <p className="mt-0.5 text-xs text-muted-foreground">{t("composer.imageHint")}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              {event.images.map((src, i) => (
                <label
                  key={src}
                  className={`cursor-pointer overflow-hidden rounded-control border-2 ${image === src ? "border-primary" : "border-transparent"}`}
                >
                  <input
                    type="radio"
                    name="image"
                    value={src}
                    checked={image === src}
                    onChange={() => setImage(src)}
                    className="sr-only"
                  />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt={src === event.coverImage ? t("composer.cover") : t("composer.galleryImage", { n: i })}
                    className="size-20 object-cover"
                  />
                </label>
              ))}
              <label
                className={`flex size-20 cursor-pointer items-center justify-center rounded-control border-2 p-2 text-center text-xs text-muted-foreground ${image === "" ? "border-primary" : "border-dashed border-border"}`}
              >
                <input
                  type="radio"
                  name="image"
                  value=""
                  checked={image === ""}
                  onChange={() => setImage("")}
                  className="sr-only"
                />
                {t("composer.noImage")}
              </label>
            </div>
          </fieldset>

          <div className="space-y-3 border-t border-border pt-5">
            <Field label={t("composer.when")} hint={t("composer.whenHint")}>
              <TextInput name="scheduledAt" type="datetime-local" />
            </Field>
            <FormFeedback state={state} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" name="intent" value="schedule" disabled={!canSubmit || !rules.promotable}>
                {t("composer.schedule")}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="now"
                variant="outline"
                disabled={!canSubmit || !rules.promotable}
              >
                {t("composer.publishNow")}
              </Button>
              <Button type="submit" name="intent" value="draft" variant="ghost" disabled={!canSubmit}>
                {pending ? t("composer.saving") : t("composer.saveDraft")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("composer.publishNowHint")}</p>
          </div>
        </div>

        <div className="space-y-3">
          <h2 className="font-semibold">{t("composer.previews")}</h2>
          <p className="text-xs text-muted-foreground">{t("composer.codePending")}</p>
          <div className="flex flex-col gap-6 lg:flex-row">
            {previewChannels.map((channel) => (
              <ChannelPreview
                key={channel}
                channel={channel}
                accountName={
                  chosenAccounts.find((a) => a.channel === channel)?.name ?? event.organizerName
                }
                message={messageFor(channel)}
                image={image || null}
              />
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}
