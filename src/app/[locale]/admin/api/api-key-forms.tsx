"use client";

import * as React from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createApiKey, revokeApiKey, type ApiKeyState } from "@/lib/admin/api-key-actions";

const fieldClass =
  "h-11 rounded-control border border-border bg-background px-3.5 text-sm outline-none focus:border-ring";

export function CopyValue({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const t = useTranslations("admin.api");
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="relative">
      <pre
        className={`overflow-x-auto rounded-control bg-secondary p-3 pr-12 text-xs leading-relaxed ${multiline ? "" : "whitespace-nowrap"}`}
      >
        {value}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t("copied") : t("copy")}
        title={copied ? t("copied") : t("copy")}
        className="absolute right-1.5 top-1.5 grid size-8 place-items-center rounded-control text-muted-foreground hover:bg-background hover:text-foreground"
      >
        {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}

export function CreateKeyForm({ organizerId }: { organizerId: string }) {
  const t = useTranslations("admin.api");
  const [state, action, pending] = useActionState<ApiKeyState, FormData>(createApiKey, undefined);
  const formRef = React.useRef<HTMLFormElement>(null);

  React.useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div>
      <form ref={formRef} action={action} className="mt-4 grid gap-3">
        <input type="hidden" name="organizerId" value={organizerId} />
        <label className="flex max-w-md flex-col gap-1.5">
          <span className="text-sm font-medium">{t("keyName")}</span>
          <input
            type="text"
            name="name"
            required
            maxLength={80}
            placeholder={t("keyNamePlaceholder")}
            className={fieldClass}
          />
        </label>
        <label className="flex max-w-xl cursor-pointer gap-3 rounded-control border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5">
          <input type="checkbox" name="canPublish" className="mt-1 accent-primary" />
          <span>
            <span className="block text-sm font-semibold">{t("canPublish")}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{t("canPublishHint")}</span>
          </span>
        </label>
        <div>
          <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
            <KeyRound className="size-4" />
            {t("create")}
          </Button>
        </div>
        {state && !state.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {t(`errors.${state.error}`)}
          </p>
        ) : null}
      </form>

      {state?.ok ? (
        <div className="mt-5 rounded-card border border-emerald-600/40 bg-emerald-50 p-4 dark:bg-emerald-950/30">
          <p className="text-sm font-semibold">{t("createdTitle", { name: state.name })}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("createdHint")}</p>
          <div className="mt-3">
            <CopyValue value={state.key} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RevokeKeyButton({ id, name }: { id: string; name: string }) {
  const t = useTranslations("admin.api");
  return (
    <form
      action={revokeApiKey}
      onSubmit={(e) => {
        if (!window.confirm(t("revokeConfirm", { name }))) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2 className="size-3.5" />
        {t("revoke")}
      </button>
    </form>
  );
}
