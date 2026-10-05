"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { BadgePercent, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Checkbox,
  Field,
  FormFeedback,
  Select,
  TextInput,
  TranslatedField,
} from "@/components/admin/fields";
import { deleteDiscount, saveDiscount } from "@/lib/admin/discount-actions";
import { toZurichInput } from "@/lib/admin/datetime";
import { formatPrice } from "@/lib/utils";
import type { AutoDiscount } from "@/lib/data/admin-catalog";

type Organizer = { id: string; name: string };
type Venue = { id: string; name: string; city: string };

function amountOf(d: AutoDiscount): string {
  return d.type === "PERCENTAGE" ? `${d.value / 100} %` : formatPrice(d.value);
}

export function DiscountsEditor({
  discounts,
  organizers,
  venues,
}: {
  discounts: AutoDiscount[];
  organizers: Organizer[];
  venues: Venue[];
}) {
  const t = useTranslations("admin.discounts");
  const [ajout, setAjout] = React.useState(false);
  const [edite, setEdite] = React.useState<string | null>(null);

  return (
    <div className="mt-6 space-y-3">
      {discounts.length === 0 && !ajout ? (
        <p className="rounded-card border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {t("empty")}
        </p>
      ) : null}

      {discounts.map((d) => (
        <div key={d.id} className="rounded-card border border-border bg-card p-4">
          {edite === d.id ? (
            <DiscountForm
              discount={d}
              organizers={organizers}
              venues={venues}
              onClose={() => setEdite(null)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <BadgePercent className="size-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {(d.label as Record<string, string>)?.fr}
                  <Badge variant={d.active ? "default" : "secondary"}>
                    {t(d.active ? "active" : "inactive")}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("summary", {
                    amount: amountOf(d),
                    n: d.minDistinctSessions ?? 0,
                    organizer: d.organizer?.name ?? "—",
                  })}
                  {d.venue ? ` · ${t("atVenue", { venue: `${d.venue.name}, ${d.venue.city}` })}` : null}
                  {" · "}
                  {t("usedOn", { n: d._count.orders })}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEdite(d.id)}>
                <Pencil className="size-4" />
                {t("edit")}
              </Button>
              <DeleteDiscount id={d.id} />
            </div>
          )}
        </div>
      ))}

      {ajout ? (
        <div className="rounded-card border border-border bg-card p-4">
          <DiscountForm
            organizers={organizers}
            venues={venues}
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
  );
}

function DiscountForm({
  discount,
  organizers,
  venues,
  onClose,
}: {
  discount?: AutoDiscount;
  organizers: Organizer[];
  venues: Venue[];
  onClose: () => void;
}) {
  const t = useTranslations("admin.discounts");
  const tf = useTranslations("admin.form");
  const [state, action, pending] = useActionState(saveDiscount, undefined);

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  const value = discount
    ? discount.type === "PERCENTAGE"
      ? String(discount.value / 100)
      : (discount.value / 100).toFixed(2)
    : "";

  return (
    <form action={action} className="space-y-3">
      {discount ? <input type="hidden" name="id" value={discount.id} /> : null}

      <TranslatedField
        name="label"
        label={t("label")}
        hint={t("labelHint")}
        value={discount?.label as Record<string, unknown> | undefined}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("organizer")}>
          <Select
            name="organizerId"
            defaultValue={discount?.organizerId ?? (organizers.length === 1 ? organizers[0].id : undefined)}
            required
            emptyLabel={organizers.length === 1 ? undefined : t("chooseOrganizer")}
            options={organizers.map((o) => ({ value: o.id, label: o.name }))}
          />
        </Field>
        <Field label={t("venue")} hint={t("venueHint")}>
          <Select
            name="venueId"
            defaultValue={discount?.venueId}
            emptyLabel={t("anyVenue")}
            options={venues.map((v) => ({ value: v.id, label: `${v.name}, ${v.city}` }))}
          />
        </Field>
        <Field label={t("type")}>
          <Select
            name="type"
            defaultValue={discount?.type ?? "PERCENTAGE"}
            options={[
              { value: "PERCENTAGE", label: t("typePercentage") },
              { value: "FIXED_AMOUNT", label: t("typeFixed") },
            ]}
          />
        </Field>
        <Field label={t("value")} hint={t("valueHint")}>
          <TextInput name="value" defaultValue={value} placeholder="15" required />
        </Field>
        <Field label={t("minDistinctSessions")} hint={t("minDistinctSessionsHint")}>
          <TextInput
            name="minDistinctSessions"
            type="number"
            min="1"
            defaultValue={discount?.minDistinctSessions ?? 3}
            required
          />
        </Field>
        <Field label={t("minAmount")} hint={t("optional")}>
          <TextInput
            name="minAmount"
            defaultValue={
              discount?.minAmountCents != null ? (discount.minAmountCents / 100).toFixed(2) : ""
            }
          />
        </Field>
        <Field label={t("validFrom")} hint={t("optional")}>
          <TextInput
            name="validFrom"
            type="datetime-local"
            defaultValue={toZurichInput(discount?.validFrom)}
          />
        </Field>
        <Field label={t("validUntil")} hint={t("optional")}>
          <TextInput
            name="validUntil"
            type="datetime-local"
            defaultValue={toZurichInput(discount?.validUntil)}
          />
        </Field>
      </div>

      <Checkbox name="active" label={t("activeLabel")} defaultChecked={discount?.active ?? true} />

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

function DeleteDiscount({ id }: { id: string }) {
  const t = useTranslations("admin.discounts");
  const tf = useTranslations("admin.form");
  const [state, action, pending] = useActionState(deleteDiscount, undefined);

  return (
    <span className="flex items-center gap-2">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label={t("delete")}
          title={t("delete")}
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
