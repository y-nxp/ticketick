"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Ban, Check, LogIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  impersonateUser,
  setDoorOrganizer,
  setUserActive,
  setUserRole,
  type AdminActionState,
} from "@/lib/auth/admin-actions";

const ROLES = [
  "CUSTOMER",
  "ORGANIZER",
  "RESELLER_AGENT",
  "DOOR_STAFF",
  "ADMIN",
] as const;

export interface UserRowData {
  id: string;
  email: string;
  name: string | null;
  role: string;
  doorOrganizerId: string | null;
  active: boolean;
  isSelf: boolean;
  lastLogin: string;
  sessions: number;
  canImpersonate: boolean;
}

export function UserRow({
  user,
  organizers,
}: {
  user: UserRowData;
  organizers: { id: string; name: string }[];
}) {
  const t = useTranslations("admin");
  const ta = useTranslations("account");

  const [roleState, roleAction, rolePending] = useActionState<
    AdminActionState | undefined,
    FormData
  >(setUserRole, undefined);
  const [doorState, doorAction, doorPending] = useActionState<
    AdminActionState | undefined,
    FormData
  >(setDoorOrganizer, undefined);
  const [activeState, activeAction, activePending] = useActionState<
    AdminActionState | undefined,
    FormData
  >(setUserActive, undefined);
  const [impersonateState, impersonateAction, impersonatePending] =
    useActionState<AdminActionState | undefined, FormData>(
      impersonateUser,
      undefined,
    );

  const error =
    roleState?.error ??
    doorState?.error ??
    activeState?.error ??
    impersonateState?.error;

  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3">
        <p className="font-medium">{user.name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
        {error ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {t(`users.errors.${error}`)}
          </p>
        ) : null}
      </td>

      <td className="px-4 py-3">
        {user.isSelf ? (
          // Son propre rôle n'est pas modifiable : la protection est aussi
          // côté serveur, ici on évite simplement de proposer l'impossible.
          <Badge variant="secondary">{ta(`roles.${user.role}`)}</Badge>
        ) : (
          <form action={roleAction}>
            <input type="hidden" name="userId" value={user.id} />
            <select
              name="role"
              defaultValue={user.role}
              disabled={rolePending}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              aria-label={t("users.changeRole", { email: user.email })}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-ring disabled:opacity-50"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ta(`roles.${role}`)}
                </option>
              ))}
            </select>
          </form>
        )}
        {!user.isSelf && user.role === "DOOR_STAFF" ? (
          <form action={doorAction} className="mt-2">
            <input type="hidden" name="userId" value={user.id} />
            <select
              name="organizerId"
              defaultValue={user.doorOrganizerId ?? ""}
              disabled={doorPending}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              aria-label={t("users.doorOrganizer", { email: user.email })}
              className="h-9 max-w-56 rounded-lg border border-border bg-background px-2 text-sm outline-none focus:border-ring disabled:opacity-50"
            >
              <option value="">{t("users.doorAllOrganizers")}</option>
              {organizers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </form>
        ) : null}
      </td>

      <td className="px-4 py-3">
        {user.isSelf ? (
          <Badge>{t("users.you")}</Badge>
        ) : (
          <form action={activeAction}>
            <input type="hidden" name="userId" value={user.id} />
            <input
              type="hidden"
              name="active"
              value={user.active ? "false" : "true"}
            />
            <button
              type="submit"
              disabled={activePending}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                user.active
                  ? "bg-muted text-foreground hover:bg-destructive/10 hover:text-destructive"
                  : "bg-destructive/10 text-destructive hover:bg-muted hover:text-foreground"
              }`}
            >
              {user.active ? (
                <>
                  <Check className="size-3.5" />
                  {t("users.active")}
                </>
              ) : (
                <>
                  <Ban className="size-3.5" />
                  {t("users.suspended")}
                </>
              )}
            </button>
          </form>
        )}
      </td>

      <td className="px-4 py-3 text-muted-foreground">{user.lastLogin}</td>
      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
        <div className="flex items-center justify-end gap-2">
          <span>{user.sessions}</span>
          {user.canImpersonate ? (
            <form action={impersonateAction}>
              <input type="hidden" name="userId" value={user.id} />
              <button
                type="submit"
                disabled={impersonatePending}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <LogIn className="size-3.5" />
                {t("users.impersonate")}
              </button>
            </form>
          ) : null}
        </div>
      </td>
    </tr>
  );
}
