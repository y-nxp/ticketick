"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Mail, Plus, Send, Trash2, UserMinus } from "lucide-react";
import { Field, TextInput } from "@/components/admin/fields";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/admin/types";
import {
  assignResellerEvent,
  inviteResellerAgent,
  revokeResellerAgent,
  saveResellerEventCommission,
  sendResellerReportNow,
  unassignResellerEvent,
} from "@/lib/resellers/actions";
import type { AgentInviteState } from "@/lib/resellers/types";
import { CommissionInputs } from "../reseller-form";

function ErrorLine({ state }: { state: { ok: boolean; error?: string } | undefined }) {
  const t = useTranslations("admin.resellers");
  if (!state || state.ok || !state.error) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(`errors.${state.error}`)}
    </p>
  );
}

export function AssignEventForm({
  resellerId,
  events,
}: {
  resellerId: string;
  events: { id: string; label: string }[];
}) {
  const t = useTranslations("admin.resellers");
  const [state, action, pending] = useActionState<FormState, FormData>(assignResellerEvent, undefined);
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("noAssignable")}</p>;
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="resellerId" value={resellerId} />
      <label className="flex min-w-64 flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium">{t("assign")}</span>
        <select
          name="eventId"
          required
          defaultValue=""
          className="h-11 w-full rounded-control border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring"
        >
          <option value="" disabled>
            {t("assignPlaceholder")}
          </option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" disabled={pending}>
        <Plus className="size-4" />
        {t("assignSubmit")}
      </Button>
      <ErrorLine state={state} />
    </form>
  );
}

export function EventCommissionEditor({
  resellerId,
  eventId,
  kind,
  bps,
  fixedCents,
  inheritLabel,
}: {
  resellerId: string;
  eventId: string;
  kind: string | null;
  bps: number;
  fixedCents: number;
  inheritLabel: string;
}) {
  const t = useTranslations("admin.resellers");
  const [current, setCurrent] = React.useState(kind ?? "INHERIT");
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveResellerEventCommission,
    undefined,
  );
  const [removeState, remove, removing] = useActionState<FormState, FormData>(
    unassignResellerEvent,
    undefined,
  );
  return (
    <div className="space-y-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          React.startTransition(() => action(data));
        }}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="resellerId" value={resellerId} />
        <input type="hidden" name="eventId" value={eventId} />
        <CommissionInputs
          prefix="override"
          kind={current}
          onKind={setCurrent}
          bps={bps}
          fixedCents={fixedCents}
          inherit={inheritLabel}
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {t("saveRule")}
        </Button>
      </form>
      <form
        action={remove}
        onSubmit={(e) => {
          if (!window.confirm(t("unassignConfirm"))) e.preventDefault();
        }}
      >
        <input type="hidden" name="resellerId" value={resellerId} />
        <input type="hidden" name="eventId" value={eventId} />
        <button
          type="submit"
          disabled={removing}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          {t("unassign")}
        </button>
      </form>
      {state?.ok ? <p className="text-xs text-primary">{t("ruleSaved")}</p> : null}
      <ErrorLine state={state} />
      <ErrorLine state={removeState} />
    </div>
  );
}

export function InviteAgentForm({ resellerId, locale }: { resellerId: string; locale: string }) {
  const t = useTranslations("admin.resellers");
  const [state, action, pending] = useActionState<AgentInviteState, FormData>(
    inviteResellerAgent,
    undefined,
  );
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="resellerId" value={resellerId} />
      <input type="hidden" name="locale" value={["fr", "en", "de", "it"].includes(locale) ? locale : "fr"} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label={t("agentEmail")}>
          <TextInput name="email" type="email" required maxLength={200} />
        </Field>
        <Field label={t("agentName")}>
          <TextInput name="name" maxLength={120} />
        </Field>
        <Button type="submit" disabled={pending}>
          <Mail className="size-4" />
          {t("invite")}
        </Button>
      </div>
      {state?.ok ? (
        <p role="status" className="text-sm text-primary">
          {t("invited", { email: state.email })}
        </p>
      ) : null}
      <ErrorLine state={state} />
    </form>
  );
}

export function RevokeAgentButton({ resellerId, userId }: { resellerId: string; userId: string }) {
  const t = useTranslations("admin.resellers");
  const [state, action, pending] = useActionState<FormState, FormData>(revokeResellerAgent, undefined);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!window.confirm(t("revokeConfirm"))) e.preventDefault();
      }}
    >
      <input type="hidden" name="resellerId" value={resellerId} />
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
      >
        <UserMinus className="size-3.5" />
        {t("revoke")}
      </button>
      <ErrorLine state={state} />
    </form>
  );
}

export function SendReportButtons({ resellerId }: { resellerId: string }) {
  const t = useTranslations("admin.resellers");
  const [state, action, pending] = useActionState<FormState, FormData>(sendResellerReportNow, undefined);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="resellerId" value={resellerId} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="span" value="day" variant="outline" disabled={pending}>
          <Send className="size-4" />
          {t("sendToday")}
        </Button>
        <Button type="submit" name="span" value="week" variant="outline" disabled={pending}>
          <Send className="size-4" />
          {t("sendWeek")}
        </Button>
      </div>
      {state?.ok ? (
        <p role="status" className="text-sm text-primary">
          {t("reportSent")}
        </p>
      ) : null}
      <ErrorLine state={state} />
    </form>
  );
}
