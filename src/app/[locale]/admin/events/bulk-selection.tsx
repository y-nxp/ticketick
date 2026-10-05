"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, FileEdit, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  bulkEventAction,
  type BulkEventAction,
  type BulkEventResult,
} from "@/lib/admin/event-actions";

interface Selection {
  ids: string[];
  selected: Set<string>;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
}

const SelectionContext = React.createContext<Selection | null>(null);

function useSelection(): Selection {
  const value = React.useContext(SelectionContext);
  if (!value) throw new Error("BulkSelection manquant");
  return value;
}

/** Sélection des lignes de la liste des spectacles, pour les actions groupées. */
export function BulkSelection({
  ids,
  children,
}: {
  ids: string[];
  children: React.ReactNode;
}) {
  const [picked, setPicked] = React.useState<Set<string>>(() => new Set());
  const idsKey = ids.join(",");

  // Un spectacle supprimé ou disparu de la liste sort de la sélection.
  const selected = React.useMemo(() => {
    const present = new Set(idsKey.split(","));
    return new Set([...picked].filter((id) => present.has(id)));
  }, [picked, idsKey]);

  const value = React.useMemo<Selection>(
    () => ({
      ids,
      selected,
      toggle: (id) =>
        setPicked((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        }),
      setAll: (on) => setPicked(on ? new Set(ids) : new Set()),
      clear: () => setPicked(new Set()),
    }),
    // `ids` change d'identité à chaque rendu serveur ; seul son contenu compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey, selected],
  );

  return (
    <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
  );
}

const checkboxClass = "size-4 cursor-pointer rounded accent-primary";

export function BulkCheckbox({ id, title }: { id: string; title: string }) {
  const t = useTranslations("admin.events.bulk");
  const { selected, toggle } = useSelection();
  return (
    <input
      type="checkbox"
      className={checkboxClass}
      checked={selected.has(id)}
      onChange={() => toggle(id)}
      aria-label={t("select", { title })}
    />
  );
}

export function BulkSelectAll() {
  const t = useTranslations("admin.events.bulk");
  const { ids, selected, setAll } = useSelection();
  const ref = React.useRef<HTMLInputElement>(null);
  const all = ids.length > 0 && selected.size === ids.length;
  const some = selected.size > 0 && !all;

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={checkboxClass}
      checked={all}
      disabled={ids.length === 0}
      onChange={() => setAll(!all)}
      aria-label={t("selectAll")}
    />
  );
}

const ACTIONS: { action: BulkEventAction; icon: React.ReactNode }[] = [
  { action: "publish", icon: <Send className="size-4" /> },
  { action: "draft", icon: <FileEdit className="size-4" /> },
  { action: "list", icon: <Eye className="size-4" /> },
  { action: "unlist", icon: <EyeOff className="size-4" /> },
];

export function BulkToolbar() {
  const t = useTranslations("admin.events.bulk");
  const { selected, clear } = useSelection();
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<BulkEventResult | null>(null);

  const count = selected.size;

  function run(action: BulkEventAction) {
    if (action === "delete" && !window.confirm(t("deleteConfirm", { count }))) {
      return;
    }
    const ids = [...selected];
    setResult(null);
    startTransition(async () => {
      const outcome = await bulkEventAction(ids, action).catch(
        (): BulkEventResult => ({ ok: false, error: "unavailable" }),
      );
      setResult(outcome);
      if (outcome.ok) clear();
    });
  }

  if (count === 0) {
    return result ? (
      <p
        role="status"
        className={
          result.ok
            ? "mt-6 text-sm text-muted-foreground"
            : "mt-6 text-sm text-destructive"
        }
      >
        {result.ok
          ? t("result", { done: result.done, skipped: result.skipped })
          : t("error")}
      </p>
    ) : null;
  }

  return (
    <div
      role="toolbar"
      aria-label={t("toolbar")}
      className="sticky top-20 z-30 mt-6 flex flex-wrap items-center gap-2 rounded-card border border-border bg-card p-3 shadow-sm"
    >
      <span className="px-2 text-sm font-medium">{t("selected", { count })}</span>
      {ACTIONS.map(({ action, icon }) => (
        <Button
          key={action}
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(action)}
        >
          {icon}
          {t(`actions.${action}`)}
        </Button>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => run("delete")}
        className="text-destructive hover:text-destructive"
      >
        <Trash2 className="size-4" />
        {t("actions.delete")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={clear}
        className="ml-auto"
      >
        <X className="size-4" />
        {t("clear")}
      </Button>
    </div>
  );
}
