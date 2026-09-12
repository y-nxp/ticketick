"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, X, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FormFeedback,
  Select,
  TextInput,
  TranslatedField,
} from "@/components/admin/fields";
import {
  deleteSession,
  deleteTicketType,
  saveSession,
  saveTicketType,
} from "@/lib/admin/event-actions";
import { toZurichInput } from "@/lib/admin/datetime";
import { formatPrice } from "@/lib/utils";
import type { FormState } from "@/lib/admin/types";
import type { EventForEdit, ReferenceData } from "@/lib/data/admin-catalog";

const STATUSES = ["PUBLISHED", "DRAFT", "CANCELLED", "SOLD_OUT", "PAST"] as const;

type Session = EventForEdit["sessions"][number];
type TicketType = Session["ticketTypes"][number];

/**
 * Séances d'un spectacle et tarifs de chaque séance.
 *
 * Les deux sont édités sur le même écran : une séance sans tarif ne peut rien
 * vendre, et les séparer obligerait à naviguer entre deux pages pour créer une
 * date exploitable.
 */
export function SessionsEditor({
  event,
  reference,
}: {
  event: EventForEdit;
  reference: ReferenceData;
}) {
  const t = useTranslations("admin.sessions");
  const [ajout, setAjout] = React.useState(false);
  const [edite, setEdite] = React.useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>

      <div className="mt-4 space-y-3">
        {event.sessions.length === 0 && !ajout ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}

        {event.sessions.map((s) => (
          <div key={s.id} className="rounded-xl border border-border p-4">
            {edite === s.id ? (
              <SessionForm
                eventId={event.id}
                session={s}
                venues={reference.venues}
                onClose={() => setEdite(null)}
              />
            ) : (
              <SessionRow
                session={s}
                venues={reference.venues}
                onEdit={() => setEdite(s.id)}
              />
            )}
          </div>
        ))}

        {ajout ? (
          <div className="rounded-xl border border-border p-4">
            <SessionForm
              eventId={event.id}
              venues={reference.venues}
              onClose={() => setAjout(false)}
            />
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAjout(true)}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        )}
      </div>
    </section>
  );
}

function SessionRow({
  session,
  venues,
  onEdit,
}: {
  session: Session;
  venues: ReferenceData["venues"];
  onEdit: () => void;
}) {
  const t = useTranslations("admin.sessions");
  const ts = useTranslations("admin.status");
  const format = useFormatter();
  const venue = venues.find((v) => v.id === session.venueId);

  const vendus = session.ticketTypes.reduce((n, x) => n + x.sold, 0);
  const offre = session.ticketTypes.reduce((n, x) => n + x.quantity, 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {format.dateTime(session.startsAt, {
              dateStyle: "full",
              timeStyle: "short",
              timeZone: "Europe/Zurich",
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {venue ? `${venue.name}, ${venue.city}` : t("noVenue")}
            {" · "}
            {ts(session.status)}
            {" · "}
            {t("soldOf", { sold: vendus, total: offre })}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <Pencil className="size-4" />
          {t("edit")}
        </Button>
        <DeleteButton
          action={deleteSession}
          id={session.id}
          libelle={t("delete")}
        />
      </div>

      <TicketTypesEditor session={session} />
    </>
  );
}

function SessionForm({
  eventId,
  session,
  venues,
  onClose,
}: {
  eventId: string;
  session?: Session;
  venues: ReferenceData["venues"];
  onClose: () => void;
}) {
  const t = useTranslations("admin.sessions");
  const tf = useTranslations("admin.form");
  const ts = useTranslations("admin.status");
  const [state, action, pending] = useActionState(saveSession, undefined);

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="eventId" value={eventId} />
      {session ? <input type="hidden" name="id" value={session.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("startsAt")}>
          <TextInput
            name="startsAt"
            type="datetime-local"
            defaultValue={toZurichInput(session?.startsAt)}
            required
          />
        </Field>
        <Field label={t("endsAt")} hint={t("optional")}>
          <TextInput
            name="endsAt"
            type="datetime-local"
            defaultValue={toZurichInput(session?.endsAt)}
          />
        </Field>
        <Field label={t("doorsAt")} hint={t("optional")}>
          <TextInput
            name="doorsAt"
            type="datetime-local"
            defaultValue={toZurichInput(session?.doorsAt)}
          />
        </Field>
        <Field label={t("venue")}>
          <Select
            name="venueId"
            defaultValue={session?.venueId}
            emptyLabel={t("noVenue")}
            options={venues.map((v) => ({
              value: v.id,
              label: `${v.name}, ${v.city}`,
            }))}
          />
        </Field>
        <Field label={t("status")}>
          <Select
            name="status"
            defaultValue={session?.status ?? "PUBLISHED"}
            options={STATUSES.map((s) => ({ value: s, label: ts(s) }))}
          />
        </Field>
      </div>

      <TranslatedField
        name="label"
        label={t("label")}
        value={session?.label as Record<string, unknown> | undefined}
        required={false}
      />

      <FormFeedback state={state} />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tf("saving") : tf("save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
          {tf("cancel")}
        </Button>
      </div>
    </form>
  );
}

// ─────────────────────────────── Tarifs

function TicketTypesEditor({ session }: { session: Session }) {
  const t = useTranslations("admin.tickets");
  const [ajout, setAjout] = React.useState(false);
  const [edite, setEdite] = React.useState<string | null>(null);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Ticket className="size-3.5" />
        {t("title")}
      </p>

      <div className="mt-2 space-y-2">
        {session.ticketTypes.length === 0 && !ajout ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : null}

        {session.ticketTypes.map((tt) =>
          edite === tt.id ? (
            <div key={tt.id} className="rounded-lg bg-muted/40 p-3">
              <TicketTypeForm
                sessionId={session.id}
                ticket={tt}
                onClose={() => setEdite(null)}
              />
            </div>
          ) : (
            <TicketTypeRow
              key={tt.id}
              ticket={tt}
              onEdit={() => setEdite(tt.id)}
            />
          ),
        )}

        {ajout ? (
          <div className="rounded-lg bg-muted/40 p-3">
            <TicketTypeForm
              sessionId={session.id}
              onClose={() => setAjout(false)}
            />
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAjout(true)}>
            <Plus className="size-4" />
            {t("add")}
          </Button>
        )}
      </div>
    </div>
  );
}

function TicketTypeRow({
  ticket,
  onEdit,
}: {
  ticket: TicketType;
  onEdit: () => void;
}) {
  const t = useTranslations("admin.tickets");
  const nom = (ticket.name as Record<string, string>)?.fr ?? "";

  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm">{nom}</span>
      <span className="shrink-0 text-sm font-medium">
        {formatPrice(ticket.priceCents)}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {t("soldOf", { sold: ticket.sold, total: ticket.quantity })}
      </span>
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <DeleteButton
        action={deleteTicketType}
        id={ticket.id}
        libelle={t("delete")}
      />
    </div>
  );
}

function TicketTypeForm({
  sessionId,
  ticket,
  onClose,
}: {
  sessionId: string;
  ticket?: TicketType;
  onClose: () => void;
}) {
  const t = useTranslations("admin.tickets");
  const tf = useTranslations("admin.form");
  const [state, action, pending] = useActionState(saveTicketType, undefined);

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      {ticket ? <input type="hidden" name="id" value={ticket.id} /> : null}

      <TranslatedField
        name="name"
        label={t("name")}
        value={ticket?.name as Record<string, unknown> | undefined}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("price")}>
          <TextInput
            name="price"
            defaultValue={ticket ? (ticket.priceCents / 100).toFixed(2) : ""}
            placeholder="45.00"
            required
          />
        </Field>
        <Field label={t("quantity")} hint={ticket ? t("sold", { n: ticket.sold }) : undefined}>
          <TextInput
            name="quantity"
            type="number"
            min="1"
            defaultValue={ticket?.quantity}
            required
          />
        </Field>
        <Field label={t("maxPerOrder")}>
          <TextInput
            name="maxPerOrder"
            type="number"
            min="1"
            defaultValue={ticket?.maxPerOrder ?? 10}
            required
          />
        </Field>
        <Field label={t("salesStartAt")} hint={t("optional")}>
          <TextInput
            name="salesStartAt"
            type="datetime-local"
            defaultValue={toZurichInput(ticket?.salesStartAt)}
          />
        </Field>
        <Field label={t("salesEndAt")} hint={t("optional")}>
          <TextInput
            name="salesEndAt"
            type="datetime-local"
            defaultValue={toZurichInput(ticket?.salesEndAt)}
          />
        </Field>
      </div>

      <FormFeedback state={state} />

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? tf("saving") : tf("save")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
          {tf("cancel")}
        </Button>
      </div>
    </form>
  );
}

/** Suppression isolée dans son formulaire, avec son motif de refus. */
function DeleteButton({
  action,
  id,
  libelle,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  id: string;
  libelle: string;
}) {
  const tf = useTranslations("admin.form");
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <span className="flex items-center gap-2">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label={libelle}
          title={libelle}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </form>
      {state && !state.ok ? (
        <span role="alert" className="text-xs text-destructive">
          {tf(`errors.${state.error}`)}
        </span>
      ) : null}
    </span>
  );
}
