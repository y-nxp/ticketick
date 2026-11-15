"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import jsQR from "jsqr";
import {
  Camera,
  CameraOff,
  Check,
  Info,
  Keyboard,
  Loader2,
  LogIn,
  SearchCheck,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { admitTicket, checkTicket, doorCounts, type DoorLookup } from "@/lib/door/actions";
import { playSound, soundOf, unlockSounds } from "@/lib/door/sounds";
import { cn, EVENT_TIME_ZONE } from "@/lib/utils";
import { DoorHeader, InstallHint, useDoorSound } from "./door-header";

interface DoorSessionOption {
  id: string;
  label: string;
}

/** `entry` : chaque billet valable est enregistré. `check` : rien n'est enregistré. */
type Mode = "entry" | "check";

const REFRESH_MS = 15_000;
/** Un même code vu en continu par la caméra n'est traité qu'une fois. */
const SAME_CODE_MS = 6_000;
/** Durée d'affichage du résultat : courte si tout va bien, plus longue sinon. */
const RESULT_MS = { good: 2_500, attention: 6_000 } as const;

type Scan = { lookup: DoorLookup; mode: Mode; id: number };

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
  // Toujours « Entrée » à l'ouverture : le mode vérification se choisit
  // à chaque fois, pour ne jamais laisser entrer quelqu'un sans l'enregistrer.
  const [mode, setMode] = React.useState<Mode>("entry");
  const [manuel, setManuel] = React.useState("");
  const [scan, setScan] = React.useState<Scan | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const [camera, setCamera] = React.useState<"off" | "on" | "denied">("off");
  const [counts, setCounts] = React.useState(initialCounts);
  const dernier = React.useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const occupeRef = React.useRef(false);
  const modeRef = React.useRef<Mode>(mode);
  const soundRef = React.useRef(sound.on);

  React.useEffect(() => {
    modeRef.current = mode;
    soundRef.current = sound.on;
  }, [mode, sound.on]);

  const rafraichir = React.useCallback(async () => {
    const next = await doorCounts(sessionId).catch(() => null);
    if (next) setCounts(next);
  }, [sessionId]);

  // Plusieurs contrôleurs à plusieurs portes : le compteur reflète aussi
  // les entrées scannées ailleurs.
  React.useEffect(() => {
    const id = window.setInterval(() => void rafraichir(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [rafraichir]);

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
      occupeRef.current = true;
      setOccupe(true);
      const modeScan = modeRef.current;
      try {
        const lookup =
          modeScan === "entry"
            ? await admitTicket(code, sessionId, locale)
            : await checkTicket(code, sessionId, locale);
        setScan({ lookup, mode: modeScan, id: now });
        const kind = soundOf(lookup);
        if (soundRef.current) playSound(kind);
        if (navigator.vibrate) {
          navigator.vibrate(kind === "admitted" || kind === "valid" ? 40 : [120, 60, 120]);
        }
        if (lookup.ok && lookup.outcome === "admitted") {
          setCounts((c) => ({ ...c, entered: c.entered + 1 }));
        }
        if (modeScan === "entry") void rafraichir();
      } catch {
        setScan(null);
      } finally {
        occupeRef.current = false;
        setOccupe(false);
      }
    },
    [sessionId, locale, rafraichir],
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
    unlockSounds();
    setMode(next);
    setScan(null);
    dernier.current = { code: "", at: 0 };
  }

  const verif = mode === "check";
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
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={actif}
                onClick={() => choisirMode(o.value)}
                className={cn(
                  "flex h-10 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-2px)] text-sm font-semibold transition-colors",
                  actif
                    ? o.value === "check"
                      ? "bg-sky-700 text-white shadow-sm"
                      : "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                <o.icon className="size-4" />
                {o.label}
              </button>
            );
          })}
        </div>

        {verif ? (
          <p className="flex items-start gap-2 rounded-control bg-sky-700/10 px-3 py-2 text-sm font-medium text-sky-800 dark:text-sky-300">
            <Info className="mt-0.5 size-4 shrink-0" />
            {t("modeCheckBanner")}
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
    if (lookup.reason === "otherSession" && mode === "check") {
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
