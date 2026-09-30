"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Send, UserMinus } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  inviteStatsViewer,
  revokeStatsViewer,
  type TeamState,
} from "@/lib/admin/team-actions";

const fieldClass =
  "h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring";

export function OrganizerPicker({
  organizers,
  value,
  pathname = "/admin/team",
}: {
  organizers: { id: string; name: string }[];
  value: string;
  pathname?: "/admin/team" | "/admin/payments";
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
}: {
  organizerId: string;
  locale: string;
}) {
  const t = useTranslations("admin.team");
  const [state, action, pending] = useActionState<TeamState, FormData>(
    inviteStatsViewer,
    undefined,
  );

  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
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
      <div className="flex items-end">
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          <Send className="size-4" />
          {t("send")}
        </Button>
      </div>
      {state?.ok ? (
        <p className="text-sm text-emerald-700 sm:col-span-3">
          {t("sent", { email: state.email })}
        </p>
      ) : null}
      {state && !state.ok ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
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
