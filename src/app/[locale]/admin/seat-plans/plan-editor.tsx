"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CircleAlert,
  CircleCheck,
  Copy,
  Eye,
  EyeOff,
  FlipHorizontal2,
  ListOrdered,
  Loader2,
  MousePointer2,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Sparkles,
  StretchHorizontal,
  Trash2,
  TriangleAlert,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  readPlanWithAi,
  saveSeatPlan,
  updateSeatPlan,
  type PlanReading,
} from "@/lib/admin/seat-plan-actions";
import { seatKey, type DraftSeat, type PlanDraft } from "@/lib/seating/detect";
import {
  alignSeats,
  draftIssues,
  draftToLayout,
  duplicateSeats,
  isIncomplete,
  mirrorSeats,
  moveSeats,
  numberRowsAndSeats,
  numberSeats,
  rotateGroup,
  spaceSeats,
  tiltSeats,
  type Orientation,
} from "@/lib/seating/draft";
import { rowNumberMarks } from "@/lib/seating/layout";

const inputClass =
  "h-9 w-full rounded-lg border border-border bg-background px-2.5 text-sm outline-none transition-colors focus:border-ring";
const panelClass = "rounded-2xl border border-border bg-card p-4";
const ZOOMS = [1, 1.5, 2.25, 3.5];

/** Couleurs nommées par l'IA, rapprochées des teintes relevées sur le plan. */
const NAMED_COLORS: Record<string, [number, number, number]> = {
  yellow: [255, 235, 59],
  red: [244, 67, 54],
  blue: [33, 150, 243],
  "light blue": [144, 202, 249],
  cyan: [0, 188, 212],
  turquoise: [64, 224, 208],
  green: [76, 175, 80],
  orange: [255, 152, 0],
  pink: [255, 80, 200],
  magenta: [255, 0, 255],
  purple: [156, 39, 176],
  violet: [143, 36, 170],
  brown: [121, 85, 72],
  grey: [158, 158, 158],
  gray: [158, 158, 158],
  beige: [245, 222, 179],
};

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hue([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  const dh = Math.abs(hue(a) - hue(b));
  return Math.min(dh, 360 - dh) + Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 8;
}

function colorOf(name: string): [number, number, number] | null {
  const key = name.trim().toLowerCase();
  return NAMED_COLORS[key] ?? NAMED_COLORS[key.split(/\s+/).pop() ?? ""] ?? null;
}

const DEFAULT_ZONE = /^Catégorie \d+$/;

interface Moving {
  x0: number;
  y0: number;
  base: PlanDraft;
  ids: Set<string>;
  /** Place cliquée déjà dans une sélection multiple : un clic sans glisser la sélectionne seule. */
  narrowTo: string | null;
  moved: boolean;
}

export function PlanEditor({
  initial,
  preview,
  aiImage = "",
  aiEnabled = false,
  pendingAi = null,
  venueId = "",
  name,
  planId,
  inUseSessions = 0,
  lockedKeys = [],
  onRestart,
}: {
  initial: PlanDraft;
  /** Plan importé affiché en fond ; absent quand on rouvre un plan enregistré. */
  preview?: string;
  aiImage?: string;
  aiEnabled?: boolean;
  /** Lecture lancée dès l'analyse, pour une image sans texte. */
  pendingAi?: Promise<PlanReading | null> | null;
  venueId?: string;
  name: string;
  /** Plan déjà enregistré : l'enregistrement le modifie au lieu d'en créer un. */
  planId?: string;
  inUseSessions?: number;
  /** Références vendues ou retenues sur une séance : ni suppression ni renumérotation. */
  lockedKeys?: string[];
  onRestart?: () => void;
}) {
  const t = useTranslations("admin.seatPlans");
  const router = useRouter();
  const [draft, setDraft] = React.useState(initial);
  const [history, setHistory] = React.useState<PlanDraft[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [mode, setMode] = React.useState<"select" | "add">("select");
  const [zoom, setZoom] = React.useState(0);
  const [showPlan, setShowPlan] = React.useState(true);
  const [addZone, setAddZone] = React.useState(initial.zones[0]?.key ?? "");
  const [drag, setDrag] = React.useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const [moving, setMoving] = React.useState<Moving | null>(null);
  const [ai, setAi] = React.useState<"idle" | "running" | "done" | "failed">(
    pendingAi ? "running" : "idle",
  );
  const [planName, setPlanName] = React.useState(name);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const nextId = React.useRef(0);
  const lastNudge = React.useRef(0);

  const issues = React.useMemo(() => draftIssues(draft), [draft]);
  const locked = React.useMemo(() => new Set(lockedKeys), [lockedKeys]);
  const lostLocked = React.useMemo(() => {
    const present = new Set(draft.seats.filter((seat) => !isIncomplete(seat)).map(seatKey));
    return lockedKeys.filter((key) => !present.has(key)).length;
  }, [draft, lockedKeys]);
  const s = draft.seatSize;
  const rowMarks = React.useMemo(
    () =>
      draft.rowNumbers
        ? rowNumberMarks({
            seatSize: s,
            seats: draft.seats.flatMap((seat) =>
              seat.section && seat.row && seat.number
                ? [{ section: seat.section, row: seat.row, number: seat.number, x: seat.x, y: seat.y }]
                : [],
            ),
          })
        : [],
    [draft.rowNumbers, draft.seats, s],
  );

  function commit(next: PlanDraft) {
    setHistory((h) => [...h.slice(-40), draft]);
    setDraft(next);
  }

  function updatePositions(fn: (seats: DraftSeat[], ids: Set<string>) => DraftSeat[]) {
    if (selected.size === 0) return;
    commit({ ...draft, seats: fn(draft.seats, selected) });
  }

  /** Flèches du clavier : une rafale de pressions ne compte que pour une annulation. */
  function nudge(dx: number, dy: number) {
    if (selected.size === 0) return;
    if (Date.now() - lastNudge.current > 800) setHistory((h) => [...h.slice(-40), draft]);
    lastNudge.current = Date.now();
    setDraft({ ...draft, seats: moveSeats(draft.seats, selected, dx, dy) });
  }

  function duplicateSelected() {
    if (selected.size === 0) return;
    const { seats, copies } = duplicateSeats(draft.seats, selected, s, () => `n${nextId.current++}`);
    commit({ ...draft, seats });
    setSelected(copies);
  }

  function undo() {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) setDraft(prev);
      return h.slice(0, -1);
    });
  }

  function updateSeats(fn: (seat: DraftSeat) => DraftSeat) {
    commit({ ...draft, seats: draft.seats.map((seat) => (selected.has(seat.id) ? fn(seat) : seat)) });
  }

  function removeSelected() {
    if (selected.size === 0) return;
    commit({ ...draft, seats: draft.seats.filter((seat) => !selected.has(seat.id)) });
    setSelected(new Set());
  }

  const applyReading = React.useCallback((reading: PlanReading | null) => {
    if (!reading) {
      setAi("failed");
      return;
    }
    setDraft((current) => {
      // Une entrée de légende par teinte relevée, la plus proche d'abord.
      const pairs: { zone: string; entry: (typeof reading.legend)[number]; d: number }[] = [];
      for (const zone of current.zones) {
        for (const entry of reading.legend) {
          const c = colorOf(entry.color);
          if (c) pairs.push({ zone: zone.key, entry, d: colorDistance(rgb(zone.color), c) });
        }
      }
      pairs.sort((a, b) => a.d - b.d);
      const named = new Map<string, (typeof reading.legend)[number]>();
      const used = new Set<(typeof reading.legend)[number]>();
      for (const p of pairs) {
        if (named.has(p.zone) || used.has(p.entry) || p.d > 60) continue;
        named.set(p.zone, p.entry);
        used.add(p.entry);
      }
      const zones = current.zones.map((z) => {
        const entry = named.get(z.key);
        if (!entry || !DEFAULT_ZONE.test(z.name)) return z;
        return { ...z, name: entry.name, declared: z.declared ?? entry.count };
      });
      // Les zones lues deviennent des choix d'affectation, sans rien déplacer.
      const known = new Set(current.sections.map((sec) => sec.name.toLowerCase()));
      const sections = [...current.sections];
      for (const title of reading.sections) {
        if (!title.trim() || known.has(title.toLowerCase())) continue;
        known.add(title.toLowerCase());
        sections.push({ key: `S${sections.length + 1}-${Date.now() % 10000}`, name: title.trim() });
      }
      return {
        ...current,
        zones,
        sections,
        declaredTotal: current.declaredTotal ?? reading.total,
      };
    });
    setAi("done");
  }, []);

  async function runAi() {
    setAi("running");
    applyReading(await readPlanWithAi(aiImage).catch(() => null));
  }

  React.useEffect(() => {
    if (!pendingAi) return;
    let live = true;
    void pendingAi.then((reading) => {
      if (live) applyReading(reading);
    });
    return () => {
      live = false;
    };
  }, [pendingAi, applyReading]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea")) return;
      if (e.key === "Escape") setSelected(new Set());
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size > 0) {
        e.preventDefault();
        removeSelected();
      }
      const arrows: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = arrows[e.key];
      if (dir && selected.size > 0) {
        e.preventDefault();
        const step = e.shiftKey ? s : s / 4;
        nudge(dir[0] * step, dir[1] * step);
      }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(draft.seats.map((seat) => seat.id)));
      }
      if (mod && e.key.toLowerCase() === "d" && selected.size > 0) {
        e.preventDefault();
        duplicateSelected();
      }
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function toSvg(e: React.PointerEvent): { x: number; y: number } {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, y: p.y };
  }

  function onBackgroundDown(e: React.PointerEvent<SVGSVGElement>) {
    if ((e.target as Element).closest("[data-seat]")) return;
    const p = toSvg(e);
    if (mode === "add") {
      const section = draft.sections[0]?.key ?? null;
      const id = `n${nextId.current++}`;
      commit({
        ...draft,
        seats: [
          ...draft.seats,
          { id, x: p.x, y: p.y, rotate: 0, zone: addZone, section, row: null, number: null },
        ],
      });
      setSelected(new Set([id]));
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    if (!e.shiftKey) setSelected(new Set());
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    if (moving) {
      const p = toSvg(e);
      const dx = p.x - moving.x0;
      const dy = p.y - moving.y0;
      if (!moving.moved && Math.hypot(dx, dy) < s * 0.15) return;
      if (!moving.moved) setMoving({ ...moving, moved: true });
      setDraft({ ...moving.base, seats: moveSeats(moving.base.seats, moving.ids, dx, dy) });
      return;
    }
    if (!drag) return;
    const p = toSvg(e);
    setDrag({ ...drag, x1: p.x, y1: p.y });
  }

  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    if (moving) {
      if (moving.moved) setHistory((h) => [...h.slice(-40), moving.base]);
      else if (moving.narrowTo) setSelected(new Set([moving.narrowTo]));
      setMoving(null);
      return;
    }
    if (!drag) return;
    const minX = Math.min(drag.x0, drag.x1);
    const maxX = Math.max(drag.x0, drag.x1);
    const minY = Math.min(drag.y0, drag.y1);
    const maxY = Math.max(drag.y0, drag.y1);
    if (maxX - minX > 2 || maxY - minY > 2) {
      const inside = draft.seats
        .filter((seat) => seat.x >= minX && seat.x <= maxX && seat.y >= minY && seat.y <= maxY)
        .map((seat) => seat.id);
      setSelected((prev) => new Set(e.shiftKey ? [...prev, ...inside] : inside));
    }
    setDrag(null);
  }

  function onSeatDown(e: React.PointerEvent, id: string) {
    e.stopPropagation();
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    // Glisser une place emmène toute la sélection dont elle fait partie.
    const ids = selected.has(id) ? selected : new Set([id]);
    setSelected(ids);
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = toSvg(e);
    setMoving({
      x0: p.x,
      y0: p.y,
      base: draft,
      ids,
      narrowTo: selected.has(id) && selected.size > 1 ? id : null,
      moved: false,
    });
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    const data = new FormData();
    data.set("name", planName.trim());
    data.set("layout", JSON.stringify(draftToLayout(draft, { keepUnused: Boolean(planId) })));
    let result;
    if (planId) {
      data.set("id", planId);
      result = await updateSeatPlan(undefined, data);
    } else {
      data.set("venueId", venueId);
      result = await saveSeatPlan(undefined, data);
    }
    setSaving(false);
    if (result?.ok && result.id) {
      router.push(`/admin/seat-plans/${result.id}`);
      router.refresh();
    } else setSaveError(result && !result.ok ? result.error : "unavailable");
  }

  const zoneColor = new Map(draft.zones.map((z) => [z.key, z.color]));
  const sectionName = new Map(draft.sections.map((sec) => [sec.key, sec.name]));
  const counts = new Map<string, number>();
  for (const seat of draft.seats) counts.set(seat.zone, (counts.get(seat.zone) ?? 0) + 1);
  const selection = draft.seats.filter((seat) => selected.has(seat.id));

  return (
    <div className="space-y-4">
      {inUseSessions > 0 ? (
        <div className="flex gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">{t("inUseWarning", { count: inUseSessions })}</p>
            <p>{t("inUseWarningHint", { count: lockedKeys.length })}</p>
          </div>
        </div>
      ) : null}
    <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-border p-0.5">
            <button
              type="button"
              onClick={() => setMode("select")}
              aria-pressed={mode === "select"}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === "select" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              <MousePointer2 className="size-4" />
              {t("modeSelect")}
            </button>
            <button
              type="button"
              onClick={() => setMode("add")}
              aria-pressed={mode === "add"}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${mode === "add" ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              <Plus className="size-4" />
              {t("modeAdd")}
            </button>
          </div>
          {mode === "add" ? (
            <select
              value={addZone}
              onChange={(e) => setAddZone(e.target.value)}
              aria-label={t("addZone")}
              className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
            >
              {draft.zones.map((z) => (
                <option key={z.key} value={z.key}>
                  {z.name}
                </option>
              ))}
            </select>
          ) : null}
          <div className="ml-auto flex gap-1">
            <Button type="button" variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
              <Undo2 className="size-4" />
              {t("undo")}
            </Button>
            <Button
              type="button"
              variant={draft.rowNumbers ? "default" : "outline"}
              size="icon"
              onClick={() => commit({ ...draft, rowNumbers: !draft.rowNumbers })}
              aria-pressed={!!draft.rowNumbers}
              aria-label={t("rowNumbers")}
              title={t("rowNumbers")}
            >
              <ListOrdered className="size-4" />
            </Button>
            {preview ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setShowPlan((v) => !v)}
                aria-label={t(showPlan ? "hidePlan" : "showPlan")}
                title={t(showPlan ? "hidePlan" : "showPlan")}
              >
                {showPlan ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setZoom((z) => Math.max(0, z - 1))}
              disabled={zoom === 0}
              aria-label={t("zoomOut")}
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}
              disabled={zoom === ZOOMS.length - 1}
              aria-label={t("zoomIn")}
            >
              <ZoomIn className="size-4" />
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t(mode === "add" ? "hintAdd" : "hintSelect")} {mode === "select" ? t("hintMove") : null}{" "}
          {lockedKeys.length > 0 ? t("hintLocked") : null}
        </p>

        <div className="max-h-[80vh] overflow-auto rounded-xl border border-border bg-white">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${draft.width} ${draft.height}`}
            style={{ width: `${ZOOMS[zoom]! * 100}%` }}
            className={`mx-auto block h-auto max-w-none touch-none select-none ${mode === "add" ? "cursor-crosshair" : ""}`}
            onPointerDown={onBackgroundDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            {preview ? (
              <image href={preview} x={0} y={0} width={draft.width} height={draft.height} opacity={showPlan ? 0.45 : 0} />
            ) : (
              <g className="pointer-events-none">
                {(draft.areas ?? []).map((a, i) => (
                  <g key={`area-${i}`}>
                    <rect x={a.x} y={a.y} width={a.w} height={a.h} rx={10} fill="#F1F2F4" stroke="#D9DBE0" />
                    {a.label ? (
                      <text
                        x={a.x + a.w / 2}
                        y={a.y + a.h / 2}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-[#6B6E76] text-[16px] font-semibold uppercase"
                      >
                        {a.label.fr}
                      </text>
                    ) : null}
                  </g>
                ))}
                {draft.marks.map((m, i) => (
                  <text
                    key={`mark-${i}`}
                    x={m.x}
                    y={m.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    style={{ fontSize: m.size * 0.8 }}
                    className="fill-[#6B6E76] font-semibold uppercase"
                  >
                    {m.text}
                  </text>
                ))}
              </g>
            )}
            {rowMarks.map((r, i) => (
              <text
                key={`row-${i}`}
                x={r.x}
                y={r.y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ fontSize: s * 0.6 }}
                className="pointer-events-none fill-[#6B6E76] font-medium"
              >
                {r.text}
              </text>
            ))}
            {draft.seats.map((seat) => {
              const isSelected = selected.has(seat.id);
              const broken = isIncomplete(seat) || issues.duplicates.has(seat.id);
              const sold = locked.has(seat.id);
              return (
                <g
                  key={seat.id}
                  data-seat=""
                  transform={`translate(${seat.x} ${seat.y})${seat.rotate ? ` rotate(${seat.rotate})` : ""}`}
                  onPointerDown={(e) => onSeatDown(e, seat.id)}
                  className="cursor-pointer"
                >
                  <title>
                    {[
                      seat.section && sectionName.get(seat.section),
                      seat.row && `${t("row")} ${seat.row}`,
                      seat.number && `${t("seat")} ${seat.number}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </title>
                  <rect
                    x={-s / 2}
                    y={-s / 2}
                    width={s}
                    height={s}
                    rx={s * 0.15}
                    fill={zoneColor.get(seat.zone) ?? "#ddd"}
                    stroke={isSelected ? "#6C5CE7" : broken ? "#DC2626" : "rgba(42,44,48,0.5)"}
                    strokeWidth={isSelected ? s * 0.16 : broken ? s * 0.12 : s * 0.04}
                    strokeDasharray={broken && !isSelected ? `${s * 0.2} ${s * 0.12}` : undefined}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{ fontSize: s * 0.48 }}
                    className="pointer-events-none fill-[#2A2C30] font-semibold"
                  >
                    {seat.number ?? "?"}
                  </text>
                  {sold ? (
                    <circle
                      cx={s * 0.42}
                      cy={-s * 0.42}
                      r={s * 0.2}
                      fill="#2A2C30"
                      stroke="#FFFFFF"
                      strokeWidth={s * 0.05}
                      className="pointer-events-none"
                    />
                  ) : null}
                </g>
              );
            })}
            {drag ? (
              <rect
                x={Math.min(drag.x0, drag.x1)}
                y={Math.min(drag.y0, drag.y1)}
                width={Math.abs(drag.x1 - drag.x0)}
                height={Math.abs(drag.y1 - drag.y0)}
                fill="rgba(108,92,231,0.12)"
                stroke="#6C5CE7"
                strokeWidth={s * 0.08}
              />
            ) : null}
          </svg>
        </div>
      </div>

      <aside className="space-y-4">
        <section className={panelClass}>
          <h2 className="font-semibold">{t("summary", { count: draft.seats.length })}</h2>
          {draft.declaredTotal !== null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {t("declaredTotal", { count: draft.declaredTotal })}
            </p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {draft.zones.map((z) => {
              const found = counts.get(z.key) ?? 0;
              return (
                <li key={z.key} className="flex items-center gap-2">
                  <input
                    type="color"
                    value={z.color}
                    aria-label={t("zoneColor")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        zones: draft.zones.map((o) => (o.key === z.key ? { ...o, color: e.target.value.toUpperCase() } : o)),
                      })
                    }
                    className="h-7 w-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <input
                    value={z.name}
                    aria-label={t("zoneName")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        zones: draft.zones.map((o) => (o.key === z.key ? { ...o, name: e.target.value } : o)),
                      })
                    }
                    className={inputClass}
                  />
                  <span
                    className={`w-16 shrink-0 text-right text-xs tabular-nums ${z.declared !== null && z.declared !== found ? "font-semibold text-amber-700" : "text-muted-foreground"}`}
                    title={z.declared !== null ? t("declared", { count: z.declared }) : undefined}
                  >
                    {z.declared !== null ? `${found} / ${z.declared}` : found}
                  </span>
                </li>
              );
            })}
          </ul>
          {aiEnabled ? (
            <div className="mt-3 flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={runAi} disabled={ai === "running"}>
                {ai === "running" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {t("aiRead")}
              </Button>
              {ai === "done" ? <span className="text-xs text-muted-foreground">{t("aiDone")}</span> : null}
              {ai === "failed" ? <span className="text-xs text-destructive">{t("aiFailed")}</span> : null}
            </div>
          ) : null}
        </section>

        <section className={panelClass}>
          {lostLocked > 0 ? (
            <div className="mb-3 space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <CircleAlert className="size-4 shrink-0" />
                {t("lockedMissing", { count: lostLocked })}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={undo} disabled={history.length === 0}>
                <Undo2 className="size-4" />
                {t("undo")}
              </Button>
            </div>
          ) : null}
          {issues.total === 0 ? (
            <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
              <CircleCheck className="size-4" />
              {t("allGood")}
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                <CircleAlert className="size-4" />
                {t("toFix", { count: issues.total })}
              </p>
              <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                {issues.noSection ? <li>{t("noSection", { count: issues.noSection })}</li> : null}
                {issues.noRow ? <li>{t("noRow", { count: issues.noRow })}</li> : null}
                {issues.noNumber ? <li>{t("noNumber", { count: issues.noNumber })}</li> : null}
                {issues.duplicates.size ? <li>{t("duplicates", { count: issues.duplicates.size })}</li> : null}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() =>
                  setSelected(
                    new Set(
                      draft.seats
                        .filter((seat) => isIncomplete(seat) || issues.duplicates.has(seat.id))
                        .map((seat) => seat.id),
                    ),
                  )
                }
              >
                {t("selectIssues")}
              </Button>
            </>
          )}
        </section>

        {selection.length > 0 ? (
          <SelectionPanel
            key={[...selected].join(",")}
            draft={draft}
            selection={selection}
            onZone={(zone) => updateSeats((seat) => ({ ...seat, zone }))}
            onSection={(section) => updateSeats((seat) => ({ ...seat, section }))}
            onRow={(row) => updateSeats((seat) => ({ ...seat, row }))}
            onNumberSeats={(first, forward, orientation) =>
              commit({ ...draft, seats: numberSeats(draft.seats, selected, first, forward, orientation) })
            }
            onNumberRows={(options) =>
              commit({ ...draft, seats: numberRowsAndSeats(draft.seats, selected, s, options) })
            }
            onMove={(dx, dy) => updatePositions((seats, ids) => moveSeats(seats, ids, dx, dy))}
            onTilt={(deg) => updatePositions((seats, ids) => tiltSeats(seats, ids, deg))}
            onRotate={(deg) => updatePositions((seats, ids) => rotateGroup(seats, ids, deg))}
            onAlign={(axis) => updatePositions((seats, ids) => alignSeats(seats, ids, axis))}
            onSpace={(orientation) => updatePositions((seats, ids) => spaceSeats(seats, ids, orientation))}
            onMirror={() => updatePositions(mirrorSeats)}
            onDuplicate={duplicateSelected}
            onDelete={removeSelected}
            onClear={() => setSelected(new Set())}
          />
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground">
            {t("selectionEmpty")}
          </p>
        )}

        <section className={panelClass}>
          <h2 className="font-semibold">{t("sections")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("sectionsHint")}</p>
          <ul className="mt-3 space-y-2">
            {draft.sections.map((sec) => (
              <li key={sec.key} className="flex items-center gap-2">
                <input
                  value={sec.name}
                  aria-label={t("sectionName")}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      sections: draft.sections.map((o) => (o.key === sec.key ? { ...o, name: e.target.value } : o)),
                    })
                  }
                  className={inputClass}
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {draft.seats.filter((seat) => seat.section === sec.key).length}
                </span>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              setDraft({
                ...draft,
                sections: [
                  ...draft.sections,
                  { key: `S${draft.sections.length + 1}-${Date.now() % 10000}`, name: t("newSection") },
                ],
              })
            }
          >
            <Plus className="size-4" />
            {t("addSection")}
          </Button>
        </section>

        <section className={panelClass}>
          {planId ? (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium">{t("name")}</span>
              <input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                minLength={2}
                maxLength={120}
                className={inputClass}
              />
            </label>
          ) : (
            <p className="text-sm">
              <span className="font-semibold">{name}</span>
            </p>
          )}
          {saveError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {t(`errors.${saveError}`)}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={save}
              disabled={
                saving ||
                issues.total > 0 ||
                lostLocked > 0 ||
                draft.seats.length === 0 ||
                planName.trim().length < 2
              }
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {t(planId ? "saveChanges" : "save")}
            </Button>
            {onRestart ? (
              <Button type="button" variant="ghost" onClick={onRestart}>
                <RotateCcw className="size-4" />
                {t("restart")}
              </Button>
            ) : planId ? (
              <Link href={`/admin/seat-plans/${planId}`} className={buttonVariants({ variant: "ghost" })}>
                {t("cancelEdit")}
              </Link>
            ) : null}
          </div>
          {issues.total > 0 || lostLocked > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t("saveBlocked")}</p>
          ) : null}
        </section>
      </aside>
    </div>
    </div>
  );
}

function SelectionPanel({
  draft,
  selection,
  onZone,
  onSection,
  onRow,
  onNumberSeats,
  onNumberRows,
  onMove,
  onTilt,
  onRotate,
  onAlign,
  onSpace,
  onMirror,
  onDuplicate,
  onDelete,
  onClear,
}: {
  draft: PlanDraft;
  selection: DraftSeat[];
  onMove: (dx: number, dy: number) => void;
  onTilt: (deg: number) => void;
  onRotate: (deg: number) => void;
  onAlign: (axis: "row" | "column") => void;
  onSpace: (orientation: Orientation) => void;
  onMirror: () => void;
  onDuplicate: () => void;
  onZone: (zone: string) => void;
  onSection: (section: string) => void;
  onRow: (row: string) => void;
  onNumberSeats: (first: number, forward: boolean, orientation: Orientation) => void;
  onNumberRows: (options: {
    orientation: Orientation;
    firstRow: string;
    rowsForward: boolean;
    firstSeat: number;
    seatsForward: boolean;
  }) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const t = useTranslations("admin.seatPlans");
  const common = <K extends keyof DraftSeat>(key: K) => {
    const values = new Set(selection.map((seat) => seat[key]));
    return values.size === 1 ? (selection[0]![key] ?? "") : "";
  };
  const [row, setRow] = React.useState(String(common("row")));
  const [firstSeat, setFirstSeat] = React.useState("1");
  const [firstRow, setFirstRow] = React.useState(String(common("row")) || "1");
  const [orientation, setOrientation] = React.useState<Orientation>("horizontal");
  const [seatsForward, setSeatsForward] = React.useState(true);
  const [rowsForward, setRowsForward] = React.useState(true);
  const [stepSize, setStepSize] = React.useState<"fine" | "seat">("fine");
  const tilts = new Set(selection.map((seat) => Math.round(seat.rotate)));
  const [degrees, setDegrees] = React.useState(tilts.size === 1 ? String([...tilts][0]) : "0");
  const first = Math.max(0, Number.parseInt(firstSeat, 10) || 1);
  const along = orientation === "horizontal";
  const step = stepSize === "seat" ? draft.seatSize : draft.seatSize / 4;
  const deg = Math.max(-180, Math.min(180, Number.parseFloat(degrees.replace(",", ".")) || 0));
  const several = selection.length > 1;

  return (
    <section className={`${panelClass} space-y-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("selection", { count: selection.length })}</h2>
        <button type="button" onClick={onClear} className="text-xs font-medium text-primary hover:underline">
          {t("clearSelection")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">{t("zone")}</span>
          <select value={String(common("zone"))} onChange={(e) => e.target.value && onZone(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {draft.zones.map((z) => (
              <option key={z.key} value={z.key}>
                {z.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">{t("section")}</span>
          <select
            value={String(common("section"))}
            onChange={(e) => e.target.value && onSection(e.target.value)}
            className={inputClass}
          >
            <option value="">—</option>
            {draft.sections.map((sec) => (
              <option key={sec.key} value={sec.key}>
                {sec.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (row.trim()) onRow(row.trim().slice(0, 8));
        }}
        className="flex items-end gap-2"
      >
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs font-medium">{t("row")}</span>
          <input value={row} onChange={(e) => setRow(e.target.value)} maxLength={8} className={inputClass} />
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={!row.trim()}>
          {t("apply")}
        </Button>
      </form>

      <fieldset className="space-y-3 rounded-xl border border-dashed border-border p-3">
        <legend className="px-1 text-xs font-semibold">{t("position")}</legend>
        <div className="flex items-center gap-3">
          <div className="grid grid-cols-3 gap-1" role="group" aria-label={t("moveBy")}>
            <span />
            <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => onMove(0, -step)} aria-label={t("moveUp")} title={t("moveUp")}>
              <ArrowUp />
            </Button>
            <span />
            <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => onMove(-step, 0)} aria-label={t("moveLeft")} title={t("moveLeft")}>
              <ArrowLeft />
            </Button>
            <span />
            <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => onMove(step, 0)} aria-label={t("moveRight")} title={t("moveRight")}>
              <ArrowRight />
            </Button>
            <span />
            <Button type="button" variant="outline" size="icon" className="size-8" onClick={() => onMove(0, step)} aria-label={t("moveDown")} title={t("moveDown")}>
              <ArrowDown />
            </Button>
            <span />
          </div>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs">{t("moveBy")}</span>
            <select value={stepSize} onChange={(e) => setStepSize(e.target.value as "fine" | "seat")} className={inputClass}>
              <option value="fine">{t("stepFine")}</option>
              <option value="seat">{t("stepSeat")}</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-muted-foreground">{t("moveHint")}</p>

        <div className="space-y-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs">{t("angle")}</span>
            <input
              value={degrees}
              onChange={(e) => setDegrees(e.target.value.replace(/[^\d.,-]/g, "").slice(0, 6))}
              inputMode="decimal"
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => onTilt(deg)}>
              {t("tilt")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => onRotate(deg)} disabled={!several || deg === 0}>
              <RotateCw />
              {t("rotateGroup")}
            </Button>
          </div>
        </div>

        {several ? (
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => onAlign("row")}>
              <AlignCenterHorizontal />
              {t("alignRow")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => onAlign("column")}>
              <AlignCenterVertical />
              {t("alignColumn")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="px-2" onClick={() => onSpace(orientation)} disabled={selection.length < 3}>
              <StretchHorizontal />
              {t("spaceEvenly")}
            </Button>
            <Button type="button" variant="outline" size="sm" className="px-2" onClick={onMirror}>
              <FlipHorizontal2 />
              {t("mirror")}
            </Button>
          </div>
        ) : null}
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onDuplicate}>
          <Copy />
          {t("duplicateSeats", { count: selection.length })}
        </Button>
        <p className="text-xs text-muted-foreground">{t("duplicateHint")}</p>
      </fieldset>

      <fieldset className="space-y-2 rounded-xl border border-dashed border-border p-3">
        <legend className="px-1 text-xs font-semibold">{t("numbering")}</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs">{t("orientation")}</span>
            <select
              value={orientation}
              onChange={(e) => setOrientation(e.target.value as Orientation)}
              className={inputClass}
            >
              <option value="horizontal">{t("horizontal")}</option>
              <option value="vertical">{t("vertical")}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs">{t("firstSeat")}</span>
            <input
              value={firstSeat}
              onChange={(e) => setFirstSeat(e.target.value.replace(/\D/g, ""))}
              inputMode="numeric"
              className={inputClass}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-xs">{t("seatOrder")}</span>
            <select
              value={seatsForward ? "1" : "0"}
              onChange={(e) => setSeatsForward(e.target.value === "1")}
              className={inputClass}
            >
              <option value="1">{t(along ? "leftToRight" : "topToBottom")}</option>
              <option value="0">{t(along ? "rightToLeft" : "bottomToTop")}</option>
            </select>
          </label>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => onNumberSeats(first, seatsForward, orientation)}
        >
          {t("numberSeats")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("numberSeatsHint")}</p>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs">{t("firstRow")}</span>
            <input value={firstRow} onChange={(e) => setFirstRow(e.target.value.slice(0, 8))} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs">{t("rowOrder")}</span>
            <select
              value={rowsForward ? "1" : "0"}
              onChange={(e) => setRowsForward(e.target.value === "1")}
              className={inputClass}
            >
              <option value="1">{t(along ? "topToBottom" : "leftToRight")}</option>
              <option value="0">{t(along ? "bottomToTop" : "rightToLeft")}</option>
            </select>
          </label>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          disabled={!firstRow.trim()}
          onClick={() =>
            onNumberRows({ orientation, firstRow: firstRow.trim(), rowsForward, firstSeat: first, seatsForward })
          }
        >
          {t("numberRows")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("numberRowsHint")}</p>
      </fieldset>

      <Button type="button" variant="outline" size="sm" onClick={onDelete}>
        <Trash2 className="size-4" />
        {t("deleteSeats", { count: selection.length })}
      </Button>
    </section>
  );
}
