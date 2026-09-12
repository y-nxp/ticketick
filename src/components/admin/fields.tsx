"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

/**
 * Champs partagés par les formulaires du backoffice.
 *
 * Le projet n'a pas de bibliothèque de formulaires : ces composants tiennent
 * lieu de socle commun pour que les écrans d'édition se ressemblent, sans
 * introduire de dépendance pour si peu.
 */

const inputClass =
  "h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring disabled:opacity-60";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput({
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
  step,
  min,
}: {
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  step?: string;
  min?: string;
}) {
  return (
    <input
      type={type}
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
      placeholder={placeholder}
      step={step}
      min={min}
      className={inputClass}
    />
  );
}

export function TextArea({
  name,
  defaultValue,
  rows = 4,
}: {
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <textarea
      name={name}
      rows={rows}
      defaultValue={defaultValue ?? ""}
      className="w-full rounded-xl border border-border bg-background p-3 text-sm outline-none focus:border-ring"
    />
  );
}

export function Select({
  name,
  defaultValue,
  options,
  required,
  emptyLabel,
}: {
  name: string;
  defaultValue?: string | null;
  options: readonly { value: string; label: string }[];
  required?: boolean;
  emptyLabel?: string;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue ?? ""}
      required={required}
      className={inputClass}
    >
      {emptyLabel !== undefined ? <option value="">{emptyLabel}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2.5 text-sm font-medium">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-border accent-[var(--primary)]"
      />
      {label}
    </label>
  );
}

type Traduit = Record<string, unknown> | null | undefined;

function texte(value: Traduit, locale: string): string {
  if (!value || typeof value !== "object") return "";
  const v = (value as Record<string, unknown>)[locale];
  return typeof v === "string" ? v : "";
}

/**
 * Saisie d'un libellé dans les quatre langues.
 *
 * Le français est seul obligatoire : l'affichage retombe dessus quand une
 * traduction manque, si bien qu'exiger les quatre alourdirait chaque création
 * sans rien garantir de plus.
 */
export function TranslatedField({
  name,
  label,
  value,
  multiline,
  required = true,
}: {
  name: string;
  label: string;
  value?: Traduit;
  multiline?: boolean;
  required?: boolean;
}) {
  const t = useTranslations("admin.form");
  const [ouvert, setOuvert] = React.useState(false);
  const autres = ["en", "de", "it"] as const;

  const renseignees = autres.filter((l) => texte(value, l) !== "").length;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {ouvert
            ? t("hideTranslations")
            : t("showTranslations", { count: renseignees })}
        </button>
      </div>

      {multiline ? (
        <TextArea name={`${name}.fr`} defaultValue={texte(value, "fr")} />
      ) : (
        <input
          name={`${name}.fr`}
          defaultValue={texte(value, "fr")}
          required={required}
          className={inputClass}
        />
      )}

      {ouvert ? (
        <div className="mt-1 grid gap-2 rounded-xl border border-dashed border-border p-3">
          {autres.map((l) => (
            <label key={l} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs font-semibold uppercase text-muted-foreground">
                {l}
              </span>
              {multiline ? (
                <TextArea
                  name={`${name}.${l}`}
                  defaultValue={texte(value, l)}
                  rows={2}
                />
              ) : (
                <input
                  name={`${name}.${l}`}
                  defaultValue={texte(value, l)}
                  className={inputClass}
                />
              )}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Message d'erreur ou de succès d'une action, sous forme de clé traduite. */
export function FormFeedback({
  state,
}: {
  state: { ok: boolean; error?: string } | undefined;
}) {
  const t = useTranslations("admin.form");
  if (!state) return null;

  if (!state.ok && state.error) {
    return (
      <p
        role="alert"
        className="rounded-xl bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
      >
        {t(`errors.${state.error}`)}
      </p>
    );
  }

  if (state.ok) {
    return (
      <p
        role="status"
        className="rounded-xl bg-primary/10 px-3.5 py-2.5 text-sm text-primary"
      >
        {t("saved")}
      </p>
    );
  }

  return null;
}
