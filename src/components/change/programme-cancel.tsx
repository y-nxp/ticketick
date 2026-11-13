"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { CheckCircle2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cancelProgrammeAction,
  type ClientAccess,
  type ProgrammeCancelState,
} from "@/lib/orders/seat-change-actions";
import { cn, formatPrice } from "@/lib/utils";

export interface ProgrammeCancelTicket {
  id: string;
  tariffName: string;
  seatLabel: string | null;
  paidCents: number;
}

const ERRORS = ["ibanMissing", "ibanInvalid", "expired", "notFound", "retry", "accountRequired"];

/**
 * Programme modifié : le client rend tout ou partie de ses billets de la
 * séance et récupère ce qu'il a payé pour eux.
 */
export function ProgrammeCancel({
  access,
  locale,
  currency,
  tickets,
  refundMode,
}: {
  access: ClientAccess;
  locale: string;
  currency: string;
  tickets: ProgrammeCancelTicket[];
  refundMode: "provider" | "transfer" | "none";
}) {
  const t = useTranslations("change.programme");
  const router = useRouter();
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [account, setAccount] = React.useState({ iban: "", holder: "" });
  const [confirming, setConfirming] = React.useState(false);
  const [state, setState] = React.useState<ProgrammeCancelState | null>(null);
  const [pending, startTransition] = React.useTransition();
  const price = (cents: number) => formatPrice(cents, locale, currency);

  const refundCents =
    refundMode === "none"
      ? 0
      : tickets.filter((x) => chosen.includes(x.id)).reduce((sum, x) => sum + x.paidCents, 0);
  const needsAccount = refundCents > 0 && refundMode === "transfer";
  const accountDone =
    !needsAccount || (account.iban.trim().length >= 15 && account.holder.trim().length >= 3);

  if (state?.ok) {
    return (
      <section className="rounded-card border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--success)]/12">
          <CheckCircle2 className="size-7 text-[var(--success)]" />
        </div>
        <h2 className="mt-4 text-2xl">{t("doneTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {state.refundCents > 0
            ? t(
                state.refund === "provider"
                  ? "doneRefundCard"
                  : state.refund === "transfer"
                    ? "doneRefundTransfer"
                    : "doneRefundLater",
                { amount: price(state.refundCents) },
              )
            : t("doneNoRefund")}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">{t("doneEmail")}</p>
        <Button
          className="mt-6"
          variant="outline"
          onClick={() => {
            setState(null);
            setChosen([]);
            setConfirming(false);
            router.refresh();
          }}
        >
          {t("continue")}
        </Button>
      </section>
    );
  }

  function toggle(id: string) {
    setConfirming(false);
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  }

  function submit() {
    if (chosen.length === 0 || !accountDone) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const result = await cancelProgrammeAction(
        access,
        chosen,
        needsAccount ? account : undefined,
      );
      setState(result);
      if (!result.ok) setConfirming(false);
    });
  }

  const errorCode = state && !state.ok ? state.error : null;

  return (
    <section className="rounded-card border border-border bg-card p-5 shadow-sm sm:p-6">
      <h2 className="flex items-center gap-2 text-xl">
        <Undo2 className="size-5 text-primary" />
        {t("cancelTitle")}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {refundMode === "none" ? t("cancelIntroNoPayment") : t("cancelIntro")}
      </p>

      <ul className="mt-4 divide-y divide-border rounded-card border border-border">
        {tickets.map((ticket) => {
          const on = chosen.includes(ticket.id);
          return (
            <li key={ticket.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-3 px-4 py-3 text-sm",
                  on && "bg-primary/5",
                )}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(ticket.id)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{ticket.seatLabel ?? ticket.tariffName}</span>
                  {ticket.seatLabel ? (
                    <span className="block text-xs text-muted-foreground">{ticket.tariffName}</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums">
                  {ticket.paidCents > 0 ? price(ticket.paidCents) : t("free")}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {chosen.length > 0 ? (
        <div className="mt-4 flex items-baseline justify-between text-sm">
          <span className="font-semibold">{t("refundTotal")}</span>
          <span className="text-xl font-extrabold tabular-nums">{price(refundCents)}</span>
        </div>
      ) : null}
      {refundCents > 0 ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {t(needsAccount ? "refundTransferHint" : "refundCardHint")}
        </p>
      ) : null}

      {needsAccount ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("ibanHolder")}</span>
            <input
              value={account.holder}
              autoComplete="name"
              onChange={(e) => setAccount((a) => ({ ...a, holder: e.target.value }))}
              className="h-11 rounded-control border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{t("iban")}</span>
            <input
              value={account.iban}
              onChange={(e) => setAccount((a) => ({ ...a, iban: e.target.value }))}
              placeholder="CH93 0076 2011 6238 5295 7"
              className="h-11 rounded-control border border-border bg-background px-3.5 font-mono text-sm outline-none focus:border-ring"
            />
          </label>
        </div>
      ) : null}

      {errorCode ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t(`errors.${ERRORS.includes(errorCode) ? errorCode : "failed"}`)}
        </p>
      ) : null}
      {confirming ? (
        <p role="alert" className="mt-4 rounded-card border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          {t("confirmWarning", { count: chosen.length })}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap justify-end gap-3">
        {confirming ? (
          <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
            {t("back")}
          </Button>
        ) : null}
        <Button
          className={confirming ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
          onClick={submit}
          disabled={pending || chosen.length === 0 || !accountDone}
        >
          {pending
            ? t("saving")
            : confirming
              ? t("confirmCancel", { count: chosen.length })
              : t("cancelButton", { count: chosen.length })}
        </Button>
      </div>
    </section>
  );
}
