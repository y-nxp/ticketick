"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Save, Trash2 } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import {
  Checkbox,
  Field,
  FormFeedback,
  Select,
  TextInput,
  TranslatedField,
} from "@/components/admin/fields";
import { deleteEvent, saveEvent } from "@/lib/admin/event-actions";
import type { EventForEdit, ReferenceData } from "@/lib/data/admin-catalog";

const STATUSES = ["DRAFT", "PUBLISHED", "CANCELLED", "SOLD_OUT", "PAST"] as const;
const VISIBILITIES = ["PUBLIC", "UNLISTED", "MEMBERS"] as const;

/**
 * Fiche d'un spectacle.
 *
 * À la création, l'enregistrement renvoie l'identifiant : on redirige vers
 * l'écran d'édition, seul endroit où ajouter séances et tarifs — ils ont
 * besoin d'un spectacle existant auquel se rattacher.
 */
export function EventForm({
  event,
  reference,
}: {
  event?: EventForEdit;
  reference: ReferenceData;
}) {
  const t = useTranslations("admin.eventForm");
  const tf = useTranslations("admin.form");
  const ts = useTranslations("admin.status");
  const router = useRouter();
  const [state, action, pending] = useActionState(saveEvent, undefined);

  const cree = !event;
  React.useEffect(() => {
    if (cree && state?.ok && state.id) {
      router.replace(`/admin/events/${state.id}`);
    }
  }, [cree, state, router]);

  const choisies = new Set(event?.categories.map((c) => c.id));

  return (
    <div className="space-y-5">
    <form id="event-form" action={action} className="space-y-5">
      {event ? <input type="hidden" name="id" value={event.id} /> : null}

      <TranslatedField
        name="title"
        label={t("title")}
        value={event?.title as Record<string, unknown> | undefined}
      />
      <TranslatedField
        name="description"
        label={t("description")}
        value={event?.description as Record<string, unknown> | undefined}
        multiline
        required={false}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("organizer")}>
          <Select
            name="organizerId"
            defaultValue={event?.organizerId}
            required
            emptyLabel={t("chooseOrganizer")}
            options={reference.organizers.map((o) => ({
              value: o.id,
              label: o.name,
            }))}
          />
        </Field>

        <Field label={t("slug")} hint={t("slugHint")}>
          <TextInput name="slug" defaultValue={event?.slug} />
        </Field>

        <Field label={t("status")}>
          <Select
            name="status"
            defaultValue={event?.status ?? "DRAFT"}
            options={STATUSES.map((s) => ({ value: s, label: ts(s) }))}
          />
        </Field>

        <Field label={t("visibility")}>
          <Select
            name="visibility"
            defaultValue={event?.visibility ?? "PUBLIC"}
            options={VISIBILITIES.map((v) => ({
              value: v,
              label: t(`visibilities.${v}`),
            }))}
          />
        </Field>

        <Field label={t("coverImage")} hint={t("coverImageHint")}>
          <TextInput name="coverImage" defaultValue={event?.coverImage} />
        </Field>
      </div>

      {reference.categories.length > 0 ? (
        <fieldset>
          <legend className="text-sm font-medium">{t("categories")}</legend>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {reference.categories.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  name="categoryIds"
                  value={c.id}
                  defaultChecked={choisies.has(c.id)}
                  className="size-4 rounded border-border accent-[var(--primary)]"
                />
                {(c.name as Record<string, string>)?.fr ?? c.slug}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Checkbox
        name="featured"
        label={t("featured")}
        defaultChecked={event?.featured}
      />

      <FormFeedback state={state} />
    </form>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" form="event-form" disabled={pending}>
          <Save className="size-4" />
          {pending ? tf("saving") : tf("save")}
        </Button>
        {event ? <DeleteEvent id={event.id} /> : null}
      </div>
    </div>
  );
}

/**
 * La suppression vit dans son propre formulaire : imbriquer deux `<form>`
 * n'est pas permis, et un second bouton `submit` dans celui d'édition
 * enverrait les champs du spectacle.
 */
function DeleteEvent({ id }: { id: string }) {
  const t = useTranslations("admin.eventForm");
  const tf = useTranslations("admin.form");
  const router = useRouter();
  const [state, action, pending] = useActionState(deleteEvent, undefined);

  React.useEffect(() => {
    if (state?.ok) router.replace("/admin/events");
  }, [state, router]);

  return (
    <>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="outline" disabled={pending}>
          <Trash2 className="size-4 text-destructive" />
          {t("delete")}
        </Button>
      </form>
      {state && !state.ok ? (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          {tf(`errors.${state.error}`)}
        </p>
      ) : null}
    </>
  );
}
