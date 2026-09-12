"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Field,
  FormFeedback,
  TextInput,
  TranslatedField,
} from "@/components/admin/fields";
import {
  deleteCategory,
  deleteOrganizer,
  deleteVenue,
  saveCategory,
  saveOrganizer,
  saveVenue,
} from "@/lib/admin/reference-actions";
import type { FormState } from "@/lib/admin/types";
import type { ReferenceData } from "@/lib/data/admin-catalog";

/**
 * Données de référence : organisateurs, lieux, catégories.
 *
 * Chaque ligne se déplie pour l'édition plutôt que d'ouvrir un écran séparé :
 * ces listes restent courtes, et la navigation coûterait plus que la place
 * gagnée.
 */

type Action = (state: FormState, data: FormData) => Promise<FormState>;

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      <div className="mt-4 space-y-2">{children}</div>
    </section>
  );
}

/** Formulaire replié derrière un bouton, pour l'ajout comme pour l'édition. */
function Repliable({
  libelle,
  ouvertParDefaut = false,
  children,
}: {
  libelle: string;
  ouvertParDefaut?: boolean;
  children: (fermer: () => void) => React.ReactNode;
}) {
  const [ouvert, setOuvert] = React.useState(ouvertParDefaut);

  if (!ouvert) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <Plus className="size-4" />
        {libelle}
      </Button>
    );
  }

  return (
    <div className="rounded-xl border border-border p-4">
      {children(() => setOuvert(false))}
    </div>
  );
}

function BoutonSuppression({
  action,
  id,
  libelle,
}: {
  action: Action;
  id: string;
  libelle: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);

  return (
    <form action={formAction} className="contents">
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
      {state && !state.ok ? (
        <span className="sr-only" role="alert">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}

/**
 * Une suppression refusée doit se voir. Le bouton seul n'a pas la place
 * d'afficher le motif : il est donc remonté au niveau de la ligne.
 */
function Ligne({
  titre,
  detail,
  compte,
  onEdit,
  suppression,
}: {
  titre: string;
  detail: string;
  compte?: string;
  onEdit: () => void;
  suppression: React.ReactNode;
}) {
  const t = useTranslations("admin.form");
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{titre}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      {compte ? (
        <span className="shrink-0 text-xs text-muted-foreground">{compte}</span>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={onEdit}
        aria-label={t("edit")}
        title={t("edit")}
      >
        <Pencil className="size-4" />
      </Button>
      {suppression}
    </div>
  );
}

// ─────────────────────────────── Organisateurs

export function OrganizersSection({
  organizers,
}: {
  organizers: ReferenceData["organizers"];
}) {
  const t = useTranslations("admin.settings.organizers");
  const [edite, setEdite] = React.useState<string | null>(null);

  return (
    <Section title={t("title")} hint={t("hint")}>
      {organizers.map((o) =>
        edite === o.id ? (
          <div key={o.id} className="rounded-xl border border-border p-4">
            <OrganizerForm organizer={o} onClose={() => setEdite(null)} />
          </div>
        ) : (
          <Ligne
            key={o.id}
            titre={o.name}
            detail={o.email}
            compte={t("eventCount", { count: o._count.events })}
            onEdit={() => setEdite(o.id)}
            suppression={
              <BoutonSuppression
                action={deleteOrganizer}
                id={o.id}
                libelle={t("delete")}
              />
            }
          />
        ),
      )}

      <Repliable libelle={t("add")} ouvertParDefaut={organizers.length === 0}>
        {(fermer) => <OrganizerForm onClose={fermer} />}
      </Repliable>
    </Section>
  );
}

function OrganizerForm({
  organizer,
  onClose,
}: {
  organizer?: ReferenceData["organizers"][number];
  onClose: () => void;
}) {
  const t = useTranslations("admin.settings.organizers");
  const tf = useTranslations("admin.form");
  const [state, action, pending] = useActionState(saveOrganizer, undefined);

  return (
    <form action={action} className="space-y-3">
      {organizer ? <input type="hidden" name="id" value={organizer.id} /> : null}

      <Field label={t("name")}>
        <TextInput name="name" defaultValue={organizer?.name} required />
      </Field>
      <Field label={t("email")}>
        <TextInput
          name="email"
          type="email"
          defaultValue={organizer?.email}
          required
        />
      </Field>
      <Field label={t("website")}>
        <TextInput name="website" defaultValue={organizer?.website} />
      </Field>

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

// ─────────────────────────────── Lieux

export function VenuesSection({ venues }: { venues: ReferenceData["venues"] }) {
  const t = useTranslations("admin.settings.venues");
  const [edite, setEdite] = React.useState<string | null>(null);

  return (
    <Section title={t("title")} hint={t("hint")}>
      {venues.map((v) =>
        edite === v.id ? (
          <div key={v.id} className="rounded-xl border border-border p-4">
            <VenueForm venue={v} onClose={() => setEdite(null)} />
          </div>
        ) : (
          <Ligne
            key={v.id}
            titre={v.name}
            detail={[v.address, v.zip, v.city].filter(Boolean).join(", ")}
            compte={t("sessionCount", { count: v._count.sessions })}
            onEdit={() => setEdite(v.id)}
            suppression={
              <BoutonSuppression
                action={deleteVenue}
                id={v.id}
                libelle={t("delete")}
              />
            }
          />
        ),
      )}

      <Repliable libelle={t("add")}>
        {(fermer) => <VenueForm onClose={fermer} />}
      </Repliable>
    </Section>
  );
}

function VenueForm({
  venue,
  onClose,
}: {
  venue?: ReferenceData["venues"][number];
  onClose: () => void;
}) {
  const t = useTranslations("admin.settings.venues");
  const tf = useTranslations("admin.form");
  const [state, action, pending] = useActionState(saveVenue, undefined);

  return (
    <form action={action} className="space-y-3">
      {venue ? <input type="hidden" name="id" value={venue.id} /> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("name")}>
          <TextInput name="name" defaultValue={venue?.name} required />
        </Field>
        <Field label={t("city")}>
          <TextInput name="city" defaultValue={venue?.city} required />
        </Field>
        <Field label={t("address")}>
          <TextInput name="address" defaultValue={venue?.address} />
        </Field>
        <Field label={t("zip")}>
          <TextInput name="zip" defaultValue={venue?.zip} />
        </Field>
        <Field label={t("lat")} hint={t("coordsHint")}>
          <TextInput name="lat" defaultValue={venue?.lat} />
        </Field>
        <Field label={t("lng")}>
          <TextInput name="lng" defaultValue={venue?.lng} />
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

// ─────────────────────────────── Catégories

export function CategoriesSection({
  categories,
}: {
  categories: ReferenceData["categories"];
}) {
  const t = useTranslations("admin.settings.categories");
  const [edite, setEdite] = React.useState<string | null>(null);

  return (
    <Section title={t("title")} hint={t("hint")}>
      {categories.map((c) =>
        edite === c.id ? (
          <div key={c.id} className="rounded-xl border border-border p-4">
            <CategoryForm category={c} onClose={() => setEdite(null)} />
          </div>
        ) : (
          <Ligne
            key={c.id}
            titre={
              (c.name as Record<string, string>)?.fr ?? c.slug
            }
            detail={c.slug}
            compte={t("eventCount", { count: c._count.events })}
            onEdit={() => setEdite(c.id)}
            suppression={
              <BoutonSuppression
                action={deleteCategory}
                id={c.id}
                libelle={t("delete")}
              />
            }
          />
        ),
      )}

      <Repliable libelle={t("add")}>
        {(fermer) => <CategoryForm onClose={fermer} />}
      </Repliable>
    </Section>
  );
}

function CategoryForm({
  category,
  onClose,
}: {
  category?: ReferenceData["categories"][number];
  onClose: () => void;
}) {
  const t = useTranslations("admin.settings.categories");
  const tf = useTranslations("admin.form");
  const [state, action, pending] = useActionState(saveCategory, undefined);

  return (
    <form action={action} className="space-y-3">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}

      <TranslatedField
        name="name"
        label={t("name")}
        value={category?.name as Record<string, unknown> | undefined}
      />
      <Field label={t("color")}>
        <TextInput
          name="color"
          type="color"
          defaultValue={category?.color ?? "#6C5CE7"}
        />
      </Field>

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
