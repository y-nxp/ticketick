"use client";

import * as React from "react";
import { useActionState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Checkbox,
  Field,
  FormFeedback,
  Select,
  TextInput,
  TranslatedField,
} from "@/components/admin/fields";
import { deleteEventOption, saveEventOption } from "@/lib/admin/option-actions";
import { formatPrice } from "@/lib/utils";
import type { EventForEdit } from "@/lib/data/admin-catalog";

type Option = EventForEdit["options"][number];
type GroupDraft = {
  title: Record<string, string>;
  required: boolean;
  choices: Record<string, string>[];
};

export function OptionsEditor({ event }: { event: EventForEdit }) {
  const t = useTranslations("admin.options");
  const [ajout, setAjout] = React.useState(false);
  const [edite, setEdite] = React.useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("hint")}</p>

      <div className="mt-4 space-y-3">
        {event.options.length === 0 && !ajout ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : null}

        {event.options.map((option) => (
          <div key={option.id} className="rounded-xl border border-border p-4">
            {edite === option.id ? (
              <OptionForm
                event={event}
                option={option}
                onClose={() => setEdite(null)}
              />
            ) : (
              <OptionRow
                event={event}
                option={option}
                onEdit={() => setEdite(option.id)}
              />
            )}
          </div>
        ))}

        {ajout ? (
          <div className="rounded-xl border border-border p-4">
            <OptionForm event={event} onClose={() => setAjout(false)} />
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

function OptionRow({
  event,
  option,
  onEdit,
}: {
  event: EventForEdit;
  option: Option;
  onEdit: () => void;
}) {
  const t = useTranslations("admin.options");
  const format = useFormatter();
  const session = event.sessions.find((s) => s.id === option.sessionId);
  const title =
    (option.title as { fr?: string })?.fr ?? t("untitled");

  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {option.enabled ? t("enabled") : t("disabled")}
          {" · "}
          {option.priceCents > 0
            ? `${formatPrice(option.priceCents)} ${
                option.priceMode === "PER_CHOICE" ? t("perChoice") : t("flat")
              }`
            : t("free")}
          {" · "}
          {session
            ? format.dateTime(session.startsAt, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Zurich",
              })
            : t("allSessions")}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="size-4" />
        {t("edit")}
      </Button>
    </div>
  );
}

function OptionForm({
  event,
  option,
  onClose,
}: {
  event: EventForEdit;
  option?: Option;
  onClose: () => void;
}) {
  const t = useTranslations("admin.options");
  const tf = useTranslations("admin.form");
  const [state, action, pending] = useActionState(saveEventOption, undefined);
  const [groups, setGroups] = React.useState<GroupDraft[]>(() =>
    (option?.groups ?? []).map((g) => ({
      title: (g.title as Record<string, string>) ?? { fr: "" },
      required: g.required,
      choices: g.choices.map(
        (c) => (c.label as Record<string, string>) ?? { fr: "" },
      ),
    })),
  );

  React.useEffect(() => {
    if (state?.ok) onClose();
  }, [state, onClose]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="eventId" value={event.id} />
      {option ? <input type="hidden" name="id" value={option.id} /> : null}
      <input type="hidden" name="groupCount" value={groups.length} />
      <input type="hidden" name="sortOrder" value={option?.sortOrder ?? 0} />

      <Checkbox
        name="enabled"
        label={t("enabled")}
        defaultChecked={option?.enabled ?? true}
      />

      <TranslatedField
        name="title"
        label={t("optionTitle")}
        value={option?.title as Record<string, unknown> | undefined}
      />
      <TranslatedField
        name="hint"
        label={t("optionHint")}
        value={option?.hint as Record<string, unknown> | undefined}
        required={false}
        multiline
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t("session")}>
          <Select
            name="sessionId"
            defaultValue={option?.sessionId ?? ""}
            emptyLabel={t("allSessions")}
            options={event.sessions.map((s) => ({
              value: s.id,
              label: new Date(s.startsAt).toLocaleString("fr-CH", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Europe/Zurich",
              }),
            }))}
          />
        </Field>
        <Field label={t("price")} hint={t("priceHint")}>
          <TextInput
            name="price"
            type="text"
            defaultValue={
              option ? (option.priceCents / 100).toFixed(2) : "0"
            }
          />
        </Field>
        <Field label={t("priceMode")}>
          <Select
            name="priceMode"
            defaultValue={option?.priceMode ?? "FLAT"}
            options={[
              { value: "FLAT", label: t("flat") },
              { value: "PER_CHOICE", label: t("perChoice") },
            ]}
          />
        </Field>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("groups")}</p>
        {groups.map((group, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border p-3">
            <input
              type="hidden"
              name={`group.${i}.choiceCount`}
              value={group.choices.length}
            />
            <TranslatedField
              name={`group.${i}.title`}
              label={t("groupTitle")}
              value={group.title}
            />
            <Checkbox
              name={`group.${i}.required`}
              label={t("groupRequired")}
              defaultChecked={group.required}
            />
            {group.choices.map((choice, j) => (
              <TranslatedField
                key={j}
                name={`group.${i}.choice.${j}.label`}
                label={t("choice", { n: j + 1 })}
                value={choice}
              />
            ))}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setGroups((prev) =>
                    prev.map((g, gi) =>
                      gi === i
                        ? { ...g, choices: [...g.choices, { fr: "" }] }
                        : g,
                    ),
                  )
                }
              >
                <Plus className="size-4" />
                {t("addChoice")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  setGroups((prev) => prev.filter((_, gi) => gi !== i))
                }
              >
                {t("removeGroup")}
              </Button>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setGroups((prev) => [
              ...prev,
              { title: { fr: "" }, required: false, choices: [{ fr: "" }] },
            ])
          }
        >
          <Plus className="size-4" />
          {t("addGroup")}
        </Button>
      </div>

      <FormFeedback state={state} />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? tf("saving") : tf("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          <X className="size-4" />
          {tf("cancel")}
        </Button>
        {option ? (
          <DeleteOption eventId={event.id} id={option.id} />
        ) : null}
      </div>
    </form>
  );
}

function DeleteOption({ eventId, id }: { eventId: string; id: string }) {
  const t = useTranslations("admin.options");
  const [state, action, pending] = useActionState(deleteEventOption, undefined);
  return (
    <>
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="eventId" value={eventId} />
        <Button type="submit" variant="outline" disabled={pending}>
          <Trash2 className="size-4 text-destructive" />
          {t("delete")}
        </Button>
      </form>
      <FormFeedback state={state} />
    </>
  );
}
