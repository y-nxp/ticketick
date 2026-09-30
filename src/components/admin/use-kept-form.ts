"use client";

import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  type FormEvent,
} from "react";
import type { FormState } from "@/lib/admin/types";

/**
 * Formulaire lié à une action serveur, sans la remise à zéro automatique de
 * React 19 : une saisie refusée reste affichée pour être corrigée. Le
 * formulaire ne revient aux valeurs enregistrées qu'après un succès.
 */
export function useKeptForm(
  serverAction: (state: FormState, data: FormData) => Promise<FormState>,
) {
  const [state, dispatch, pending] = useActionState(serverAction, undefined);
  const ref = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => dispatch(data));
  }

  return { state, pending, formProps: { ref, onSubmit } };
}
