"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import jsQR from "jsqr";
import {
  Camera,
  CameraOff,
  Check,
  CloudOff,
  Info,
  Keyboard,
  Loader2,
  LogIn,
  RefreshCw,
  SearchCheck,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { admitTicket, checkTicket } from "@/lib/door/actions";
import { entryOpensAt } from "@/lib/door/entry-window";
import { clearDoorStorage, type DoorConflict, type ScanLookup } from "@/lib/door/offline";
import { playSound, soundOf, unlockSounds, type DoorSound } from "@/lib/door/sounds";
import { cn, EVENT_TIME_ZONE } from "@/lib/utils";
import { DoorHeader, InstallHint, useDoorSound } from "./door-header";
import { useDoorSync, withTimeout, type DoorSyncState } from "./use-door-sync";

interface DoorSessionOption {
  id: string;
  label: string;
  /** Début de la séance (ISO) : l'entrée s'ouvre deux heures avant. */
  startsAt: string;
}

/** `entry` : chaque billet valable est enregistré. `check` : rien n'est enregistré. */
type Mode = "entry" | "check";

/** Billet absent de la liste du téléphone : le serveur a ce délai pour répondre. */
const SERVER_TIMEOUT_MS = 8_000;
/** Un même code vu en continu par la caméra n'est traité qu'une fois. */
const SAME_CODE_MS = 6_000;
/** Durée d'affichage du résultat : courte si tout va bien, plus longue sinon. */
const RESULT_MS = { good: 2_500, attention: 6_000 } as const;

type Scan = { lookup: ScanLookup; mode: Mode; id: number };

export function DoorScanner({
  sessions,
  sessionId,
  initialCounts,
}: {
  sessions: DoorSessionOption[];
  sessionId: string;
  initialCounts: { entered: number; expected: number };
}) {
  const t = useTranslations("door");
  const locale = useLocale();
  const router = useRouter();
  const sound = useDoorSound();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  // L'entrée s'ouvre deux heures avant le début ; d'ici là, vérification seule.
  const startsAt = sessions.find((s) => s.id === sessionId)?.startsAt;
  const opensAt = startsAt ? entryOpensAt(startsAt) : 0;
  const [now, setNow] = React.useState(() => Date.now());
  const entryOpen = now >= opensAt;
  React.useEffect(() => {
    if (entryOpen) return;
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [entryOpen]);
  // « Entrée » à l'ouverture dès qu'elle est permise : le mode vérification se
  // choisit à chaque fois, pour ne jamais laisser entrer quelqu'un sans
  // l'enregistrer. Avant l'heure, « Vérifier », puis « Entrée » à l'heure dite.
  const [mode, setMode] = React.useState<Mode>(() => (Date.now() >= opensAt ? "entry" : "check"));
  const [wasOpen, setWasOpen] = React.useState(entryOpen);
  if (entryOpen !== wasOpen) {
    setWasOpen(entryOpen);
    if (entryOpen) setMode("entry");
  }
  const [manuel, setManuel] = React.useState("");
  const [scan, setScan] = React.useState<Scan | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const [camera, setCamera] = React.useState<"off" | "on" | "denied">("off");
  const sync = useDoorSync(sessionId, locale);
  const counts = sync.counts ?? initialCounts;
  const dernier = React.useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const occupeRef = React.useRef(false);
  const modeRef = React.useRef<Mode>(mode);
  const soundRef = React.useRef(sound.on);

  React.useEffect(() => {
    modeRef.current = mode;
    soundRef.current = sound.on;
  }, [mode, sound.on]);

  // Les listes des séances qui ne sont plus à contrôler (noms des acheteurs)
  // ne restent pas sur le téléphone, sauf entrées encore à envoyer.
  const sessionIds = sessions.map((s) => s.id).join(",");
  React.useEffect(() => {
    clearDoorStorage(sessionIds.split(","));
  }, [sessionIds]);

  // Le premier toucher, où qu'il soit, autorise le son.
  React.useEffect(() => {
    const unlock = () => unlockSounds();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Le résultat s'efface seul ; un nouveau scan le remplace aussitôt.
  React.useEffect(() => {
    if (!scan) return;
    const good =
      scan.lookup.ok && (scan.lookup.outcome === "admitted" || scan.lookup.outcome === "valid");
    const id = window.setTimeout(
      () => setScan((s) => (s?.id === scan.id ? null : s)),
      good ? RESULT_MS.good : RESULT_MS.attention,
    );
    return () => window.clearTimeout(id);
  }, [scan]);

  const traiter = React.useCallback(
    async (brut: string, source: "camera" | "manual") => {
      const code = brut.trim().toUpperCase();
      if (!code || occupeRef.current) return;
      const now = Date.now();
      if (
        source === "camera" &&
        code === dernier.current.code &&
        now - dernier.current.at < SAME_CODE_MS
      ) {
        return;
      }
      dernier.current = { code, at: now };
      const modeScan = modeRef.current;

      const montrer = (lookup: ScanLookup) => {
        setScan({ lookup, mode: modeScan, id: now });
        const kind: DoorSound =
          !lookup.ok && lookup.reason === "offlineUnknown" ? "already" : soundOf(lookup);
        if (soundRef.current) playSound(kind);
        if (navigator.vibrate) {
          navigator.vibrate(kind === "admitted" || kind === "valid" ? 40 : [120, 60, 120]);
        }
      };

      // 1. La liste du téléphone répond tout de suite, réseau ou pas.
      const local = sync.lookup(code, modeScan);
      if (local.kind === "found") {
        if (local.admit) sync.recordAdmission(code);
        montrer(local.lookup);
        return;
      }

      // 2. Billet absent de la liste (acheté à l'instant, autre séance…) : le serveur.
      occupeRef.current = true;
      setOccupe(true);
      try {
        const lookup = await withTimeout(
          modeScan === "entry"
            ? admitTicket(code, sessionId, locale)
            : checkTicket(code, sessionId, locale),
          SERVER_TIMEOUT_MS,
        );
        montrer(lookup);
        if (lookup.ok) void sync.sync();
      } catch {
        montrer({ ok: false, reason: "offlineUnknown" });
      } finally {
        occupeRef.current = false;
        setOccupe(false);
      }
    },
    [sessionId, locale, sync],
  );

  // Caméra : lecture continue des QR codes, écran maintenu allumé.
  React.useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | null = null;
    let wakeLock: { release: () => Promise<void> } | null = null;
    let frame = 0;
    let ignore = false;

    async function demarrer() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (ignore || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        lire();
      } catch {
        if (!ignore) setCamera("denied");
        return;
      }
      try {
        const wl = (
          navigator as Navigator & {
            wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
          }
        ).wakeLock;
        if (wl && !ignore) wakeLock = await wl.request("screen");
      } catch {
        // Écran qui se met en veille : gênant mais sans conséquence.
      }
    }

    function lire() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        frame = requestAnimationFrame(lire);
        return;
      }
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, pixels.width, pixels.height, {
        inversionAttempts: "dontInvert",
      });
      if (code?.data) void traiter(code.data, "camera");
      frame = requestAnimationFrame(lire);
    }

    void demarrer();
    return () => {
      ignore = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void wakeLock?.release().catch(() => undefined);
    };
  }, [camera, traiter]);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    unlockSounds();
    void traiter(manuel, "manual");
    setManuel("");
  }

  function choisirMode(next: Mode) {
    if (next === "entry" && !entryOpen) return;
    unlockSounds();
    setMode(next);
    setScan(null);
    dernier.current = { code: "", at: 0 };
  }

  const verif = mode === "check";
  const opens = {
    day: new Intl.DateTimeFormat(`${locale}-CH`, {
      timeZone: EVENT_TIME_ZONE,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(opensAt),
    time: new Intl.DateTimeFormat(`${locale}-CH`, {
      timeZone: EVENT_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(opensAt),
  };
  const pourcent =
    counts.expected > 0 ? Math.min(100, Math.round((counts.entered / counts.expected) * 100)) : 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <DoorHeader sound={sound} />

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <select
          value={sessionId}
          aria-label={t("session")}
          onChange={(e) => router.replace({ pathname: "/door", query: { s: e.target.value } })}
          className="h-11 w-full truncate rounded-control border border-border bg-card px-3 text-sm font-semibold outline-none focus:border-ring"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>

        {/* Mode : Entrée (par défaut) ou Vérifier */}
        <div
          role="radiogroup"
          aria-label={t("mode")}
          className="grid grid-cols-2 gap-1 rounded-control bg-muted p-1"
        >
          {(
            [
              { value: "entry", icon: LogIn, label: t("modeEntry") },
              { value: "check", icon: SearchCheck, label: t("modeCheck") },
            ] as const
          ).map((o) => {
            const actif = mode === o.value;
            const ferme = o.value === "entry" && !entryOpen;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={actif}
                disabled={ferme}
                onClick={() => choisirMode(o.value)}
                className={cn(
                  "flex min-h-10 flex-col items-center justify-center rounded-[calc(var(--radius-control)-2px)] text-sm font-semibold transition-colors",
                  actif
                    ? o.value === "check"
                      ? "bg-sky-700 text-white shadow-sm"
                      : "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground",
                  ferme && "cursor-not-allowed py-1 opacity-70",
                )}
              >
                <span className="flex items-center gap-2">
                  <o.icon className="size-4" />
                  {o.label}
                </span>
                {ferme ? (
                  <span className="text-[11px] font-normal leading-tight">
                    {t("entryOpensAt", opens)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <SyncBar state={sync.state} onSync={() => void sync.sync()} />
        {sync.state.conflicts.length > 0 ? (
          <Conflicts conflicts={sync.state.conflicts} onClear={sync.clearConflicts} />
        ) : null}

        {verif ? (
          <p className="flex items-start gap-2 rounded-control bg-sky-700/10 px-3 py-2 text-sm font-medium text-sky-800 dark:text-sky-300">
            <Info className="mt-0.5 size-4 shrink-0" />
            {entryOpen ? t("modeCheckBanner") : t("entryClosedBanner", opens)}
          </p>
        ) : (
          <div className="rounded-control border border-border bg-card px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Users className="size-4" />
                {t("entered")}
              </p>
              <p className="tabular-nums">
                <span className="text-xl font-extrabold">{counts.entered}</span>
                <span className="text-sm text-muted-foreground">
                  {" "}
                  {t("expected", { count: counts.expected })}
                </span>
              </p>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={counts.expected}
              aria-valuenow={counts.entered}
              aria-label={t("entered")}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${pourcent}%` }}
              />
            </div>
          </div>
        )}

        {/* Viseur, avec le résultat par-dessus */}
        <div
          className={cn(
            "relative aspect-square w-full overflow-hidden rounded-card bg-[#1E1F23] ring-4 transition-colors",
            verif ? "ring-sky-700" : "ring-transparent",
          )}
        >
          {camera === "on" ? (
            <video ref={videoRef} className="size-full object-cover" playsInline muted />
          ) : (
            <div className="grid size-full place-items-center px-6 text-center text-white">
              <div>
                {camera === "denied" ? (
                  <>
                    <CameraOff className="mx-auto size-10 text-white/80" />
                    <p className="mt-3 text-sm text-white/80">{t("cameraDenied")}</p>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 border-white/40 text-white hover:bg-white/10"
                      onClick={() => setCamera("on")}
                    >
                      {t("retryCamera")}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-white/70">{t("cameraHint")}</p>
                    <Button
                      type="button"
                      size="lg"
                      onClick={() => {
                        unlockSounds();
                        setCamera("on");
                      }}
                    >
                      <Camera className="size-5" />
                      {t("startCamera")}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />

          {camera === "on" ? <Viseur /> : null}

          {verif && camera === "on" ? (
            <span className="absolute left-3 top-3 rounded-full bg-sky-700 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-white">
              {t("modeCheck")}
            </span>
          ) : null}

          {occupe ? (
            <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/50 text-white">
              <Loader2 className="size-4 animate-spin" />
            </span>
          ) : null}

          <div aria-live="assertive" aria-atomic>
            {scan ? (
              <Resultat key={scan.id} scan={scan} locale={locale} onClose={() => setScan(null)} />
            ) : null}
          </div>
        </div>

        <form onSubmit={soumettre} className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={manuel}
              onChange={(e) => setManuel(e.target.value.toUpperCase())}
              placeholder={t("manualPlaceholder")}
              aria-label={t("manualPlaceholder")}
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              className="h-11 w-full rounded-control border border-border bg-card pl-10 pr-3 font-mono text-base outline-none focus:border-ring"
            />
          </label>
          {verif ? (
            <button
              type="submit"
              disabled={occupe || !manuel.trim()}
              className="h-11 shrink-0 rounded-control bg-sky-700 px-5 text-sm font-medium text-white shadow-sm hover:bg-sky-800 disabled:opacity-50"
            >
              {t("checkOnly")}
            </button>
          ) : (
            <Button type="submit" disabled={occupe || !manuel.trim()} className="h-11 px-5">
              {t("check")}
            </Button>
          )}
        </form>

        {camera === "on" ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => setCamera("off")}>
            <CameraOff className="size-4" />
            {t("stopCamera")}
          </Button>
        ) : null}

        <InstallHint />
      </div>
    </div>
  );
}

/** Coins du cadre de visée. */
function Viseur() {
  const coin = "absolute size-10 border-white/90";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-[14%]">
      <span className={cn(coin, "left-0 top-0 rounded-tl-xl border-l-4 border-t-4")} />
      <span className={cn(coin, "right-0 top-0 rounded-tr-xl border-r-4 border-t-4")} />
      <span className={cn(coin, "bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4")} />
      <span className={cn(coin, "bottom-0 right-0 rounded-br-xl border-b-4 border-r-4")} />
    </div>
  );
}

function Resultat({
  scan,
  locale,
  onClose,
}: {
  scan: Scan;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations("door");
  const { lookup, mode } = scan;

  let tone: "ok" | "check" | "warn" | "ko";
  let Icon = Check;
  let title: string;
  let detail: string | null = null;

  if (!lookup.ok) {
    if (lookup.reason === "offlineUnknown") {
      tone = "warn";
      Icon = CloudOff;
      title = t("offlineUnknownTitle");
    } else if (lookup.reason === "otherSession" && mode === "check") {
      tone = "warn";
      Icon = TriangleAlert;
      title = t("otherSessionTitle");
    } else {
      tone = "ko";
      Icon = X;
      title = t("refused");
    }
    detail = t(lookup.reason);
  } else if (lookup.outcome === "already") {
    tone = "warn";
    Icon = TriangleAlert;
    title = t("alreadyUsed");
    const heure = lookup.usedAt
      ? new Intl.DateTimeFormat(`${locale}-CH`, {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: EVENT_TIME_ZONE,
        }).format(new Date(lookup.usedAt))
      : null;
    detail = heure ? t("usedAt", { time: heure }) : null;
  } else if (lookup.outcome === "valid") {
    tone = "check";
    title = t("valid");
    detail = t("validHint");
  } else {
    tone = "ok";
    title = t("admitted");
  }

  const ticket = "ticket" in lookup ? lookup.ticket : null;

  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`${title}. ${t("tapToClose")}`}
      className={cn(
        "absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-5 py-6 text-center text-white",
        tone === "ok" && "bg-emerald-600",
        tone === "check" && "bg-sky-700",
        tone === "warn" && "bg-amber-600",
        tone === "ko" && "bg-red-700",
      )}
    >
      <span className="grid size-16 shrink-0 place-items-center rounded-full bg-white/20">
        <Icon className="size-10" strokeWidth={3} aria-hidden />
      </span>
      <span className="mt-3 text-3xl font-extrabold uppercase tracking-tight">{title}</span>
      {detail ? <span className="mt-1 text-sm font-semibold text-white/90">{detail}</span> : null}

      {ticket ? (
        <span className="mt-4 block w-full max-w-xs space-y-0.5">
          <span className="block font-semibold">{ticket.eventTitle}</span>
          <span className="block text-sm text-white/90">
            {ticket.ticketName} · {ticket.when}
          </span>
          {ticket.seat ? <span className="block text-lg font-bold">{ticket.seat}</span> : null}
          {ticket.attendee ? (
            <span className="mt-2 block rounded-control bg-white/15 px-3 py-2">
              <span className="block text-xs font-bold uppercase tracking-wide">{t("checkId")}</span>
              <span className="block font-semibold">{ticket.attendee}</span>
              {ticket.attendeeBirthDate ? (
                <span className="block text-sm">{t("bornOn", { date: ticket.attendeeBirthDate })}</span>
              ) : null}
            </span>
          ) : null}
          <span className="block pt-1 text-sm">{ticket.buyer}</span>
          <span className="block font-mono text-xs tracking-wider text-white/80">{ticket.code}</span>
        </span>
      ) : null}

      <span className="mt-4 text-xs text-white/70">{t("tapToClose")}</span>
    </button>
  );
}

function heureCourte(iso: string | number, locale: string, seconds = false): string {
  return new Intl.DateTimeFormat(`${locale}-CH`, {
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
    timeZone: EVENT_TIME_ZONE,
  }).format(new Date(iso));
}

/** État de la synchronisation : à jour, hors ligne, dernière synchro, entrées en attente. */
function SyncBar({ state, onSync }: { state: DoorSyncState; onSync: () => void }) {
  const t = useTranslations("door");
  const locale = useLocale();
  const { snapshot, syncedAt, pending, online, syncing } = state;

  const statut = !online
    ? { label: t("syncOffline"), dot: "bg-amber-500" }
    : !snapshot
      ? { label: t("syncLoading"), dot: "bg-muted-foreground" }
      : { label: t("syncOk"), dot: "bg-emerald-500" };

  return (
    <div className="flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 text-xs">
      <span className={cn("size-2 shrink-0 rounded-full", statut.dot)} aria-hidden />
      <p className="min-w-0 flex-1 leading-snug">
        <span className="font-semibold">{statut.label}</span>
        <span className="text-muted-foreground">
          {" · "}
          {syncedAt ? t("lastSync", { time: heureCourte(syncedAt, locale, true) }) : t("syncNever")}
          {snapshot ? ` · ${t("ticketsLoaded", { count: snapshot.tickets.length })}` : ""}
        </span>
        {pending.length > 0 ? (
          <span className="font-semibold text-amber-700 dark:text-amber-400">
            {" · "}
            {t("pending", { count: pending.length })}
          </span>
        ) : null}
      </p>
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        aria-label={syncing ? t("syncing") : t("syncNow")}
        title={syncing ? t("syncing") : t("syncNow")}
        className="-my-1 grid size-9 shrink-0 place-items-center rounded-control text-muted-foreground hover:bg-secondary/70 disabled:opacity-60"
      >
        <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
      </button>
    </div>
  );
}

/** Billets validés ici hors connexion alors que le serveur les avait déjà vus passer, ou refusés. */
function Conflicts({ conflicts, onClear }: { conflicts: DoorConflict[]; onClear: () => void }) {
  const t = useTranslations("door");
  const locale = useLocale();
  return (
    <div role="alert" className="rounded-control border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-sm">
      <p className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
        <TriangleAlert className="size-4 shrink-0" />
        {t("conflictsTitle", { count: conflicts.length })}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{t("conflictsHint")}</p>
      <ul className="mt-2 space-y-1 text-xs">
        {conflicts.map((c) => (
          <li key={`${c.code}-${c.usedAt ?? c.reason}`}>
            <span className="font-mono font-semibold">{c.code}</span>
            {c.buyer ? ` · ${c.buyer}` : ""}
            {" · "}
            {c.kind === "already"
              ? c.usedAt
                ? t("conflictAt", { time: heureCourte(c.usedAt, locale) })
                : t("alreadyUsed")
              : t(c.reason ?? "unknown")}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 text-xs font-semibold text-amber-800 underline underline-offset-2 dark:text-amber-300"
      >
        {t("conflictsClear")}
      </button>
    </div>
  );
}
