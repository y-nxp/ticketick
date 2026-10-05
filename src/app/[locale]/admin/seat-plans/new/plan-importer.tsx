"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readPlanWithAi, type PlanReading } from "@/lib/admin/seat-plan-actions";
import { detectPlan, type PlanDraft } from "@/lib/seating/detect";
import { loadPlanFile, PlanFileError } from "@/lib/seating/load-plan";
import { PlanEditor } from "../plan-editor";

const inputClass =
  "h-11 w-full rounded-control border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-ring";

interface Venue {
  id: string;
  name: string;
  city: string;
}

interface Loaded {
  draft: PlanDraft;
  preview: string;
  aiImage: string;
  pendingAi: Promise<PlanReading | null> | null;
}

export function PlanImporter({ venues, aiEnabled }: { venues: Venue[]; aiEnabled: boolean }) {
  const t = useTranslations("admin.seatPlans");
  const [venueId, setVenueId] = React.useState("");
  const [name, setName] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [working, setWorking] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [loaded, setLoaded] = React.useState<Loaded | null>(null);

  async function analyse(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !venueId || name.trim().length < 2) return;
    setWorking(true);
    setError(null);
    try {
      const plan = await loadPlanFile(file);
      // Laisse le navigateur afficher l'indicateur avant le calcul.
      await new Promise((r) => setTimeout(r, 30));
      const draft = detectPlan(plan.raster, plan.words);
      if (draft.seats.length === 0) {
        setError("noSeats");
        return;
      }
      setLoaded({
        draft,
        preview: plan.preview,
        aiImage: plan.aiImage,
        // Sans texte dans le fichier, seule l'IA peut lire la légende.
        pendingAi:
          aiEnabled && plan.words.length === 0
            ? readPlanWithAi(plan.aiImage).catch(() => null)
            : null,
      });
    } catch (err) {
      setError(err instanceof PlanFileError ? err.key : "planFileUnreadable");
    } finally {
      setWorking(false);
    }
  }

  if (loaded) {
    return (
      <PlanEditor
        initial={loaded.draft}
        preview={loaded.preview}
        aiImage={loaded.aiImage}
        aiEnabled={aiEnabled}
        pendingAi={loaded.pendingAi}
        venueId={venueId}
        name={name.trim()}
        onRestart={() => setLoaded(null)}
      />
    );
  }

  return (
    <form
      onSubmit={analyse}
      className="max-w-xl space-y-4 rounded-card border border-border bg-card p-5"
    >
      {venues.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noVenue")}</p>
      ) : null}
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("venue")}</span>
        <select
          value={venueId}
          onChange={(e) => setVenueId(e.target.value)}
          required
          className={inputClass}
        >
          <option value="">{t("venuePick")}</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}, {v.city}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("name")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
          placeholder={t("namePlaceholder")}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("file")}</span>
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          required
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
        />
        <span className="text-xs text-muted-foreground">{t("fileHint")}</span>
      </label>
      {error ? (
        <p role="alert" className="rounded-control bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      ) : null}
      <Button type="submit" disabled={working || !file || !venueId || name.trim().length < 2}>
        {working ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
        {working ? t("analysing") : t("analyse")}
      </Button>
    </form>
  );
}
