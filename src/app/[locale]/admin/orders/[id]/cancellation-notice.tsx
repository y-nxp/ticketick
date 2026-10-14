"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyCancellationAction } from "@/lib/admin/order-edit-actions";
import type { FormState } from "@/lib/admin/types";

export function CancellationNotice({
  orderId,
  email,
  tickets,
}: {
  orderId: string;
  email: string;
  tickets: { id: string; code: string; label: string; noticeSent: string | null }[];
}) {
  const t = useTranslations("admin.orderEdit");
  const [picked, setPicked] = React.useState<string[]>(() =>
    tickets.filter((x) => !x.noticeSent).map((x) => x.id),
  );
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await notifyCancellationAction(prev, formData);
      if (result?.ok) setPicked([]);
      return result;
    },
    undefined,
  );

  return (
    <section className="mt-6 rounded-card border border-border bg-card p-5">
      <h3 className="font-semibold">{t("cancelNotice")}</h3>
      <form
        action={action}
        onSubmit={(e) => {
          if (!window.confirm(t("cancelNoticeConfirm", { count: picked.length, email }))) {
            e.preventDefault();
          }
        }}
        className="mt-3 space-y-4"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <p className="text-sm text-muted-foreground">{t("cancelNoticeHint")}</p>
        <ul className="divide-y divide-border rounded-control border border-border">
          {tickets.map((ticket) => (
            <li key={ticket.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                name="ticket"
                value={ticket.id}
                checked={picked.includes(ticket.id)}
                onChange={(e) =>
                  setPicked((prev) =>
                    e.target.checked
                      ? [...prev, ticket.id]
                      : prev.filter((id) => id !== ticket.id),
                  )
                }
                aria-label={ticket.code}
                className="size-4 accent-[var(--primary)]"
              />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs tracking-wider">{ticket.code}</p>
                {ticket.label ? (
                  <p className="truncate text-xs text-muted-foreground">{ticket.label}</p>
                ) : null}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {ticket.noticeSent
                  ? t("cancelNoticeSentOn", { date: ticket.noticeSent })
                  : t("cancelNoticeNotYet")}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={pending || picked.length === 0}>
            <Mail className="size-4" />
            {pending ? t("sending") : t("cancelNoticeSend")}
          </Button>
          {state?.ok ? (
            <p role="status" className="text-sm text-[var(--success)]">
              {t(`cancelNoticeDone.${state.id}`)}
            </p>
          ) : null}
          {state && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {t(`errors.${state.error}`)}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
