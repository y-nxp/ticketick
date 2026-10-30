"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  deleteSalesAlert,
  notifySalesAlerts,
  setSalesPaused,
  type SalesPauseResult,
} from "@/lib/admin/sales-pause-actions";
import { cn, formatDate } from "@/lib/utils";

export interface SalesAlertRow {
  id: string;
  email: string;
  locale: string;
  createdAt: string;
  notifiedAt: string | null;
}

/**
 * Vente suspendue d'un spectacle : interrupteur, message de reprise et liste
 * des personnes qui attendent.
 */
export function SalesPauseSection({
  eventId,
  paused,
  alerts,
  locale,
}: {
  eventId: string;
  paused: boolean;
  alerts: SalesAlertRow[];
  locale: string;
}) {
  const t = useTranslations("admin.salesPause");
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [message, setMessage] = React.useState<{ tone: "ok" | "error"; text: string } | null>(
    null,
  );
  const [copied, setCopied] = React.useState(false);

  const waiting = alerts.filter((a) => !a.notifiedAt);

  function run(action: () => Promise<SalesPauseResult>, okText?: (r: SalesPauseResult) => string) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        if (okText) setMessage({ tone: "ok", text: okText(result) });
        router.refresh();
      } else {
        setMessage({ tone: "error", text: t(`errors.${result.error}`) });
      }
    });
  }

  function toggle() {
    if (!paused && !window.confirm(t("confirmPause"))) return;
    run(() => setSalesPaused(eventId, !paused));
  }

  function notify() {
    if (!window.confirm(t("confirmNotify", { count: waiting.length }))) return;
    run(
      () => notifySalesAlerts(eventId),
      (r) =>
        r.ok && r.failed
          ? t("notifiedPartly", { sent: r.sent ?? 0, failed: r.failed })
          : t("notified", { count: r.ok ? (r.sent ?? 0) : 0 }),
    );
  }

  function remove(id: string, email: string) {
    if (!window.confirm(t("confirmDelete", { email }))) return;
    run(() => deleteSalesAlert(id));
  }

  async function copy() {
    await navigator.clipboard.writeText(alerts.map((a) => a.email).join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-card border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 font-semibold">
            {t("title")}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                paused
                  ? "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                  : "bg-secondary text-muted-foreground",
              )}
            >
              {paused ? t("statePaused") : t("stateOpen")}
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {paused ? t("hintPaused") : t("hintOpen")}
          </p>
        </div>
        <Button
          type="button"
          variant={paused ? "default" : "outline"}
          disabled={pending}
          onClick={toggle}
        >
          {paused ? t("resume") : t("pause")}
        </Button>
      </div>

      {waiting.length > 0 ? (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-control bg-secondary p-4 text-sm">
          <p className="min-w-0 flex-1">
            {paused
              ? t("waitingPaused", { count: waiting.length })
              : t("waitingOpen", { count: waiting.length })}
          </p>
          {paused ? null : (
            <Button type="button" size="sm" disabled={pending} onClick={notify}>
              {t("notify", { count: waiting.length })}
            </Button>
          )}
        </div>
      ) : null}

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-3 text-sm",
            message.tone === "error" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {message.text}
        </p>
      ) : null}

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium">{t("listTitle", { count: alerts.length })}</h3>
          {alerts.length ? (
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? t("copied") : t("copy")}
            </Button>
          ) : null}
        </div>
        {alerts.length ? (
          <div className="mt-3 overflow-x-auto rounded-control border border-border">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-semibold">{t("email")}</th>
                  <th className="px-3 py-2 font-semibold">{t("language")}</th>
                  <th className="px-3 py-2 font-semibold">{t("since")}</th>
                  <th className="px-3 py-2 font-semibold">{t("notifiedAt")}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{t("delete")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="px-3 py-2 [overflow-wrap:anywhere]">{a.email}</td>
                    <td className="px-3 py-2 uppercase">{a.locale}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(a.createdAt, `${locale}-CH`)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {a.notifiedAt ? (
                        formatDate(a.notifiedAt, `${locale}-CH`)
                      ) : (
                        <span className="text-muted-foreground">{t("waiting")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(a.id, a.email)}
                        disabled={pending}
                        aria-label={t("deleteAria", { email: a.email })}
                        className="rounded-control p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-50"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </div>
    </section>
  );
}
