"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, X, Ticket, Armchair, TicketCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Checkbox,
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
import { EVENT_TIME_ZONE, formatPrice } from "@/lib/utils";
import type { FormState } from "@/lib/admin/types";
import type { EventForEdit, ReferenceData } from "@/lib/data/admin-catalog";

const STATUSES = ["PUBLISHED", "DRAFT", "CANCELLED", "SOLD_OUT", "PAST"] as const;

type Session = EventForEdit["sessions"][number];
type TicketType = Session["ticketTypes"][number];
type SeatPlanRef = ReferenceData["seatPlans"][number];

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
    <section className="rounded-card border border-border bg-card p-6">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>

      <div className="mt-4 space-y-3">
        {event.sessions.length === 0 && !ajout ? (
          <p className="rounded-control border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}

        {event.sessions.map((s) => (
          <div key={s.id} className="rounded-control border border-border p-4">
            {edite === s.id ? (
              <SessionForm
                eventId={event.id}
                session={s}
                venues={reference.venues}
                seatPlans={reference.seatPlans}
                eventAcceptCard={event.acceptCard}
                eventAcceptIban={event.acceptIban}
                onClose={() => setEdite(null)}
              />
            ) : (
              <SessionRow
                eventId={event.id}
                session={s}
                venues={reference.venues}
                plan={reference.seatPlans.find((p) => p.id === s.seatPlanId)}
                onEdit={() => setEdite(s.id)}
              />
            )}
          </div>
        ))}

        {ajout ? (
          <div className="rounded-control border border-border p-4">
            <SessionForm
              eventId={event.id}
              venues={reference.venues}
              seatPlans={reference.seatPlans}
              eventAcceptCard={event.acceptCard}
              eventAcceptIban={event.acceptIban}
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
  eventId,
  session,
  venues,
  plan,
  onEdit,
}: {
  eventId: string;
  session: Session;
  venues: ReferenceData["venues"];
  plan?: SeatPlanRef;
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
              timeZone: EVENT_TIME_ZONE,
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {venue ? `${venue.name}, ${venue.city}` : t("noVenue")}
            {" · "}
            {ts(session.status)}
            {" · "}
            {session.capacity != null
              ? t("soldOfCapacity", {
                  sold: session.sold,
                  total: session.capacity,
                })
              : t("soldOf", { sold: vendus, total: offre })}
            {session.inviteSeats > 0 ? ` · ${t("inviteSeatsHeld", { count: session.inviteSeats })}` : null}
            {plan ? ` · ${plan.name}` : null}
          </p>
        </div>
        {session.ticketTypes.length > 0 ? (
          <Link
            href={`/admin/events/${eventId}/reserve/${session.id}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <TicketCheck className="size-4" />
            {t("reserve")}
          </Link>
        ) : null}
        {session.seatPlanId ? (
          <Link
            href={`/admin/events/${eventId}/seats/${session.id}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <Armchair className="size-4" />
            {t("seats")}
          </Link>
        ) : null}
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

      <TicketTypesEditor session={session} plan={plan} />
    </>
  );
}

function overrideValue(value: boolean | null | undefined): "inherit" | "on" | "off" {
  if (value === true) return "on";
  if (value === false) return "off";
  return "inherit";
}

function SessionForm({
  eventId,
  session,
  venues,
  seatPlans,
  eventAcceptCard,
  eventAcceptIban,
  onClose,
}: {
  eventId: string;
  session?: Session;
  venues: ReferenceData["venues"];
  seatPlans: SeatPlanRef[];
  eventAcceptCard: boolean;
  eventAcceptIban: boolean;
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
        <Field label={t("capacity")} hint={t("capacityHint")}>
          <TextInput
            name="capacity"
            type="number"
            min="1"
            defaultValue={session?.capacity ?? ""}
          />
        </Field>
        {session?.seatPlanId ? null : (
          <Field label={t("inviteSeats")} hint={t("inviteSeatsHint")}>
            <TextInput
              name="inviteSeats"
              type="number"
              min="0"
              defaultValue={session?.inviteSeats ?? 0}
            />
          </Field>
        )}
        {seatPlans.length > 0 ? (
          <Field label={t("seatPlan")} hint={t("seatPlanHint")}>
            <Select
              name="seatPlanId"
              defaultValue={session?.seatPlanId}
              emptyLabel={t("seatPlanNone")}
              options={seatPlans.map((p) => {
                const venue = venues.find((v) => v.id === p.venueId);
                return {
                  value: p.id,
                  label: t("seatPlanOption", {
                    name: p.name,
                    venue: venue ? `${venue.name}, ${venue.city}` : "—",
                    seats: p.seatCount,
                  }),
                };
              })}
            />
          </Field>
        ) : null}
      </div>

      <TranslatedField
        name="label"
        label={t("label")}
        value={session?.label as Record<string, unknown> | undefined}
        required={false}
      />

      <details
        className="rounded-control border border-border px-3 py-2"
        open={
          session?.acceptCard != null || session?.acceptIban != null
        }
      >
        <summary className="cursor-pointer text-sm font-medium">
          {t("moreOptions")}
        </summary>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("paymentsOverrideHint")}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t("acceptCard")}>
            <Select
              name="acceptCard"
              defaultValue={overrideValue(session?.acceptCard)}
              options={[
                {
                  value: "inherit",
                  label: t("inheritPayment", {
                    state: eventAcceptCard ? t("paymentOn") : t("paymentOff"),
                  }),
                },
                { value: "on", label: t("paymentOn") },
                { value: "off", label: t("paymentOff") },
              ]}
            />
          </Field>
          <Field label={t("acceptIban")}>
            <Select
              name="acceptIban"
              defaultValue={overrideValue(session?.acceptIban)}
              options={[
                {
                  value: "inherit",
                  label: t("inheritPayment", {
                    state: eventAcceptIban ? t("paymentOn") : t("paymentOff"),
                  }),
                },
                { value: "on", label: t("paymentOn") },
                { value: "off", label: t("paymentOff") },
              ]}
            />
          </Field>
        </div>
      </details>

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

function TicketTypesEditor({
  session,
  plan,
}: {
  session: Session;
  plan?: SeatPlanRef;
}) {
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
                sources={paidTickets(session, tt.id)}
                plan={plan}
                onClose={() => setEdite(null)}
              />
            </div>
          ) : (
            <TicketTypeRow
              key={tt.id}
              ticket={tt}
              plan={plan}
              onEdit={() => setEdite(tt.id)}
            />
          ),
        )}

        {ajout ? (
          <div className="rounded-lg bg-muted/40 p-3">
            <TicketTypeForm
              sessionId={session.id}
              sources={paidTickets(session)}
              plan={plan}
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

function ticketName(ticket: TicketType): string {
  return (ticket.name as Record<string, string>)?.fr ?? "";
}

/**
 * Tarifs payants d'une séance, candidats à débloquer une gratuité.
 * Un tarif gratuit ou accompagnant ne peut pas en débloquer un autre.
 */
function paidTickets(session: Session, exclude?: string): TicketType[] {
  return session.ticketTypes.filter(
    (tt) =>
      tt.id !== exclude &&
      tt.priceCents > 0 &&
      tt.maxPerPaidTicket == null,
  );
}

function TicketTypeRow({
  ticket,
  plan,
  onEdit,
}: {
  ticket: TicketType;
  plan?: SeatPlanRef;
  onEdit: () => void;
}) {
  const t = useTranslations("admin.tickets");
  const nom = ticketName(ticket);
  const details = [
    plan && ticket.seatZones.length > 0
      ? plan.zones
          .filter((z) => ticket.seatZones.includes(z.key))
          .map((z) => z.name.fr)
          .join(", ")
      : null,
    ticket.requiresAttendee
      ? ticket.maxAgeYears
        ? t("attendeeUnderAge", { age: ticket.maxAgeYears })
        : t("attendeeRequired")
      : null,
  ].filter(Boolean);

  return (
    <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
      <span className="min-w-0 flex-1 text-sm">
        <span className="block truncate">{nom}</span>
        {details.length > 0 ? (
          <span className="block truncate text-xs text-muted-foreground">
            {details.join(" · ")}
          </span>
        ) : null}
      </span>
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
  sources,
  plan,
  onClose,
}: {
  sessionId: string;
  ticket?: TicketType;
  /** Tarifs payants de la séance, pour rattacher une gratuité à l'un d'eux. */
  sources: TicketType[];
  plan?: SeatPlanRef;
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
        <Field label={t("maxPerPaidTicket")} hint={t("maxPerPaidHint")}>
          <TextInput
            name="maxPerPaidTicket"
            type="number"
            min="1"
            defaultValue={ticket?.maxPerPaidTicket ?? ""}
          />
        </Field>
        <Field label={t("companionOf")} hint={t("companionOfHint")}>
          <Select
            name="companionOfId"
            defaultValue={ticket?.companionOfId ?? undefined}
            emptyLabel={t("companionOfAny")}
            options={sources.map((s) => ({
              value: s.id,
              label: ticketName(s),
            }))}
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
        <Field label={t("maxAgeYears")} hint={t("maxAgeHint")}>
          <TextInput
            name="maxAgeYears"
            type="number"
            min="1"
            defaultValue={ticket?.maxAgeYears ?? ""}
          />
        </Field>
      </div>

      <div>
        <Checkbox
          name="requiresAttendee"
          label={t("requiresAttendee")}
          defaultChecked={ticket?.requiresAttendee ?? false}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("requiresAttendeeHint")}
        </p>
      </div>

      {plan ? (
        <fieldset>
          <legend className="text-sm font-medium">{t("seatZones")}</legend>
          <p className="mt-1 text-xs text-muted-foreground">{t("seatZonesHint")}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {plan.zones.map((z) => (
              <label key={z.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="seatZones"
                  value={z.key}
                  defaultChecked={
                    !ticket?.seatZones.length || ticket.seatZones.includes(z.key)
                  }
                  className="size-4 rounded border-border accent-[var(--primary)]"
                />
                <span
                  aria-hidden
                  className="size-3 rounded-sm border border-border"
                  style={{ backgroundColor: z.color }}
                />
                {z.name.fr}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

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
