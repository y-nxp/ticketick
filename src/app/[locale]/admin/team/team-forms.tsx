"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { ChartColumn, CreditCard, ScanLine, Send, UserMinus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  inviteStatsViewer,
  revokeStatsViewer,
  type TeamState,
} from "@/lib/admin/team-actions";

const fieldClass =
  "h-11 rounded-control border border-border bg-background px-3.5 text-sm outline-none focus:border-ring";

export function OrganizerPicker({
  organizers,
  value,
  pathname = "/admin/team",
}: {
  organizers: { id: string; name: string }[];
  value: string;
  pathname?: "/admin/team" | "/admin/payments" | "/admin/api";
}) {
  const t = useTranslations("admin.team");
  const router = useRouter();
  return (
    <label className="mt-6 flex max-w-sm flex-col gap-1.5">
      <span className="text-sm font-medium">{t("organizer")}</span>
      <select
        value={value}
        onChange={(e) =>
          router.replace({ pathname, query: { o: e.target.value } })
        }
        className={fieldClass}
      >
        {organizers.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function InviteForm({
  organizerId,
  locale,
  events,
}: {
  organizerId: string;
  locale: string;
  /** Spectacles auxquels limiter la caisse. */
  events: { id: string; label: string }[];
}) {
  const t = useTranslations("admin.team");
  const [state, action, pending] = useActionState<TeamState, FormData>(
    inviteStatsViewer,
    undefined,
  );
  const [access, setAccess] = useState<"stats" | "door">("stats");
  const [till, setTill] = useState(false);

  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="organizerId" value={organizerId} />
      <input type="hidden" name="locale" value={locale} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("email")}</span>
        <input type="email" name="email" required className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("name")}</span>
        <input type="text" name="name" className={fieldClass} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="text-sm font-medium">{t("access")}</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {(
            [
              { value: "stats", icon: ChartColumn, title: "accessStats", hint: "accessStatsHint" },
              { value: "door", icon: ScanLine, title: "accessDoor", hint: "accessDoorHint" },
            ] as const
          ).map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer gap-3 rounded-control border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="access"
                value={o.value}
                checked={access === o.value}
                onChange={() => setAccess(o.value)}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <o.icon className="size-4 text-primary" />
                  {t(o.title)}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t(o.hint)}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {access === "door" ? (
        <fieldset className="sm:col-span-2">
          <legend className="text-sm font-medium">{t("doorWhat")}</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer gap-3 rounded-control border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input type="checkbox" name="scan" defaultChecked className="mt-1 accent-primary" />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <ScanLine className="size-4 text-primary" />
                  {t("doorScan")}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t("doorScanHint")}</span>
              </span>
            </label>
            <label className="flex cursor-pointer gap-3 rounded-control border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
              <input
                type="checkbox"
                name="till"
                checked={till}
                onChange={(e) => setTill(e.target.checked)}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <CreditCard className="size-4 text-primary" />
                  {t("doorTill")}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{t("doorTillHint")}</span>
              </span>
            </label>
          </div>
          {till ? (
            <label className="mt-3 flex max-w-md flex-col gap-1.5">
              <span className="text-sm font-medium">{t("tillEvent")}</span>
              <select name="tillEventId" defaultValue="" className={fieldClass}>
                <option value="">{t("tillEventAll")}</option>
                {events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </fieldset>
      ) : null}
      <div className="sm:col-span-2">
        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
          <Send className="size-4" />
          {t("send")}
        </Button>
      </div>
      {state?.ok ? (
        <p className="text-sm text-emerald-700 sm:col-span-2">
          {t("sent", { email: state.email })}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-2">
          {t(`errors.${state.error}`)}
        </p>
      ) : null}
    </form>
  );
}

export function RevokeButton({
  userId,
  organizerId,
  email,
}: {
  userId: string;
  organizerId: string;
  email: string;
}) {
  const t = useTranslations("admin.team");
  const [state, action, pending] = useActionState<TeamState, FormData>(
    revokeStatsViewer,
    undefined,
  );
  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="organizerId" value={organizerId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={t("revokeLabel", { email })}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      >
        <UserMinus className="size-3.5" />
        {t("revoke")}
      </button>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-destructive">
          {t(`errors.${state.error}`)}
        </span>
      ) : null}
    </form>
  );
}
