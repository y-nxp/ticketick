"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cancelFreeTicketsAction } from "@/lib/orders/seat-change-actions";

export function FreeCancelPanel({
  orderId,
  tickets,
}: {
  orderId: string;
  tickets: {
    id: string;
    title: string;
    when: string;
    tariffName: string;
    seatLabel: string | null;
    until: string;
  }[];
}) {
  const t = useTranslations("account.manage");
  const router = useRouter();
  const [picked, setPicked] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function cancel(ids: string[]) {
    if (ids.length === 0 || !window.confirm(t("cancelConfirm", { count: ids.length }))) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelFreeTicketsAction(orderId, ids);
      if (!result.ok) {
        setError(result.error === "used" ? t("errors.used") : t("errors.failed"));
        return;
      }
      setPicked([]);
      setDone(true);
      router.refresh();
    });
  }

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm">
      <h2 className="text-xl">{t("cancelTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("cancelIntro")}</p>
      <ul className="mt-4 divide-y divide-border rounded-control border border-border">
        {tickets.map((ticket) => (
          <li key={ticket.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={picked.includes(ticket.id)}
                onChange={(e) =>
                  setPicked((prev) =>
                    e.target.checked ? [...prev, ticket.id] : prev.filter((x) => x !== ticket.id),
                  )
                }
                className="size-4 accent-[var(--primary)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{ticket.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {ticket.when} · {ticket.tariffName}
                  {ticket.seatLabel ? ` · ${ticket.seatLabel}` : ""}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("cancelUntil", { date: ticket.until })}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={pending || picked.length === 0}
          onClick={() => cancel(picked)}
        >
          {t("cancelSelected", { count: picked.length })}
        </Button>
        {tickets.length > 1 ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => cancel(tickets.map((x) => x.id))}
          >
            {t("cancelAll")}
          </Button>
        ) : null}
      </div>
      {done ? (
        <p role="status" className="mt-3 text-sm text-[var(--success)]">
          {t("cancelDone")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
