/**
 * Forme renvoyée par les actions du backoffice.
 *
 * Isolée de `form.ts` : ce dernier est marqué `server-only`, or les
 * composants client doivent pouvoir typer le résultat de `useActionState`
 * sans importer un module interdit au navigateur.
 */
export type FormState =
  | { ok: true; id?: string }
  | { ok: false; error: string }
  | undefined;
