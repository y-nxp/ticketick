"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Mail, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import {
  sendProgrammeLinksAction,
  type ProgrammeSendState,
} from "@/lib/admin/programme-actions";
import { formatPrice } from "@/lib/utils";

export interface ProgrammeBuyerRow {
  orderId: string;
  reference: string;
  name: string;
  email: string;
  tickets: number;
  paidCents: number;
  otherShows: number;
  reseller: string | null;
  refundMode: "provider" | "transfer" | "none";
  link: { sentAt: string; expiresAt: string; usedAt: string | null } | null;
}

const field =
  "w-full rounded-control border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-ring";

export function ProgrammeForm({
  eventId,
  sessionId,
  locale,
  defaultUntil,
  maxUntil,
  buyers,
}: {
  eventId: string;
  sessionId: string;
  locale: string;
  defaultUntil: string;
  maxUntil: string;
  buyers: ProgrammeBuyerRow[];
}) {
  const t = useTranslations("admin.programme");
  const [state, action, pending] = React.useActionState<ProgrammeSendState, FormData>(
    sendProgrammeLinksAction,
    undefined,
  );
  const eligible = buyers.filter((b) => !b.reseller && b.email);
  const [chosen, setChosen] = React.useState<string[]>(() =>
    eligible.filter((b) => !b.link).map((b) => b.orderId),
  );
  // Champs contrôlés : React vide un formulaire après chaque action, et
  // l'envoi qui suit un essai partirait sans le message.
  const [messageFr, setMessageFr] = React.useState("");
  const [messageEn, setMessageEn] = React.useState("");
  const [until, setUntil] = React.useState(defaultUntil);
  const price = (cents: number) => formatPrice(cents, locale, "CHF");
  const all = eligible.length > 0 && chosen.length === eligible.length;

  function toggle(id: string) {
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  return (
    <form
      action={action}
      className="space-y-6"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "send" && !window.confirm(t("confirmSend", { count: chosen.length }))) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="sessionId" value={sessionId} />
      {chosen.map((id) => (
        <input key={id} type="hidden" name="order" value={id} />
      ))}

      <section className="rounded-card border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">
            {t("buyers", { count: buyers.length })} · {t("selected", { count: chosen.length })}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={all}
              onChange={() => setChosen(all ? [] : eligible.map((b) => b.orderId))}
              className="size-4 accent-[var(--primary)]"
            />
            {t("selectAll")}
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-3" />
                <th className="px-4 py-3 font-semibold">{t("colBuyer")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("colTickets")}</th>
                <th className="px-4 py-3 text-right font-semibold">{t("colPaid")}</th>
                <th className="px-4 py-3 font-semibold">{t("colRefund")}</th>
                <th className="px-4 py-3 font-semibold">{t("colLink")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {buyers.map((b) => {
                const disabled = !!b.reseller || !b.email;
                return (
                  <tr key={b.orderId} className={disabled ? "opacity-60" : undefined}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={chosen.includes(b.orderId)}
                        onChange={() => toggle(b.orderId)}
                        className="size-4 accent-[var(--primary)]"
                        aria-label={b.name}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{b.name || b.email}</p>
                      <p className="text-xs text-muted-foreground">
                        <Link href={`/admin/orders/${b.orderId}`} className="font-mono hover:text-foreground">
                          {b.reference}
                        </Link>
                        {b.email ? ` · ${b.email}` : ` · ${t("noEmail")}`}
                      </p>
                      {b.otherShows > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {t("otherShows", { count: b.otherShows })}
                        </p>
                      ) : null}
                      {b.reseller ? (
                        <p className="text-xs text-muted-foreground">{t("reseller", { name: b.reseller })}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{b.tickets}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{price(b.paidCents)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={b.refundMode === "provider" ? "success" : "secondary"}>
                        {t(`refund.${b.refundMode}`)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {b.link ? (
                        <>
                          <p>{t("sentAt", { date: b.link.sentAt })}</p>
                          <p>
                            {b.link.usedAt
                              ? t("usedAt", { date: b.link.usedAt })
                              : t("until", { date: b.link.expiresAt })}
                          </p>
                        </>
                      ) : (
                        t("notSent")
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("messageFr")}</span>
          <textarea
            name="messageFr"
            rows={12}
            value={messageFr}
            onChange={(e) => setMessageFr(e.target.value)}
            className={field}
            placeholder={t("messagePlaceholder")}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("messageEn")}</span>
          <textarea
            name="messageEn"
            rows={12}
            value={messageEn}
            onChange={(e) => setMessageEn(e.target.value)}
            className={field}
            placeholder={t("messagePlaceholder")}
          />
        </label>
        <p className="text-xs text-muted-foreground lg:col-span-2">{t("messageHint")}</p>
      </section>

      <section className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{t("untilLabel")}</span>
          <input
            type="date"
            name="until"
            value={until}
            onChange={(e) => setUntil(e.target.value)}
            max={maxUntil}
            required
            className="h-11 rounded-control border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
          />
        </label>
        <p className="max-w-md pb-2 text-xs text-muted-foreground">{t("untilHint")}</p>
      </section>

      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${["noneSelected", "untilPast", "testFailed", "notFound"].includes(state.error) ? state.error : "failed"}`)}
        </p>
      ) : null}
      {state?.ok && state.test ? (
        <p className="text-sm text-[var(--success)]">{t("testSent", { email: state.to })}</p>
      ) : null}
      {state?.ok && !state.test ? (
        <div className="text-sm">
          <p className="text-[var(--success)]">{t("sent", { count: state.sent })}</p>
          {state.failed.length > 0 ? (
            <p className="text-destructive">{t("failedList", { list: state.failed.join(", ") })}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-border pt-4">
        <Button type="submit" name="intent" value="test" variant="outline" disabled={pending || chosen.length === 0}>
          <Mail className="size-4" />
          {t("sendTest")}
        </Button>
        <Button type="submit" name="intent" value="send" disabled={pending || chosen.length === 0}>
          <Send className="size-4" />
          {pending ? t("sending") : t("send", { count: chosen.length })}
        </Button>
      </div>
    </form>
  );
}
