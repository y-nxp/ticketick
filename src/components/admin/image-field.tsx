"use client";

import { Field } from "@/components/admin/fields";

export function ImageField({
  name,
  fileName,
  label,
  hint,
  currentUrl,
}: {
  name: string;
  fileName: string;
  label: string;
  hint: string;
  currentUrl?: string | null;
}) {
  return (
    <Field label={label} hint={hint}>
      {currentUrl ? (
        // Aperçu de la valeur enregistrée : une image distante ou un upload.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentUrl}
          alt=""
          className="mb-2 h-14 w-auto max-w-full rounded-lg border border-border bg-white object-contain p-1"
        />
      ) : null}
      <input type="hidden" name={name} value={currentUrl ?? ""} />
      <input
        type="file"
        name={fileName}
        accept="image/png,image/jpeg,image/webp"
        className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground"
      />
    </Field>
  );
}
