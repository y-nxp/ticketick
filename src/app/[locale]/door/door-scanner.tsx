"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import jsQR from "jsqr";
import { Camera, Keyboard, Loader2, ScanLine, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { admitTicket, doorCounts, type DoorLookup } from "@/lib/door/actions";
import { EVENT_TIME_ZONE } from "@/lib/utils";

interface DoorSessionOption {
  id: string;
  label: string;
}

const REFRESH_MS = 15_000;

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
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [manuel, setManuel] = React.useState("");
  const [resultat, setResultat] = React.useState<DoorLookup | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const [camera, setCamera] = React.useState<"off" | "on" | "denied">("off");
  const [counts, setCounts] = React.useState(initialCounts);
  const dernier = React.useRef("");
  const occupeRef = React.useRef(false);

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

  const traiter = React.useCallback(
    async (brut: string) => {
      const code = brut.trim().toUpperCase();
      if (!code || code === dernier.current || occupeRef.current) return;
      dernier.current = code;
      occupeRef.current = true;
      setOccupe(true);
      try {
        const next = await admitTicket(code, sessionId, locale);
        setResultat(next);
        if (navigator.vibrate) {
          navigator.vibrate(next.ok && next.outcome === "admitted" ? 40 : 200);
        }
        if (next.ok && next.outcome === "admitted") {
          setCounts((c) => ({ ...c, entered: c.entered + 1 }));
        }
        void rafraichir();
      } finally {
        occupeRef.current = false;
        setOccupe(false);
        window.setTimeout(() => {
          if (dernier.current === code) dernier.current = "";
        }, 2500);
      }
    },
    [sessionId, locale, rafraichir],
  );

  React.useEffect(() => {
    if (camera !== "on") return;
    let stream: MediaStream | null = null;
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
      if (code?.data) void traiter(code.data);
      frame = requestAnimationFrame(lire);
    }

    void demarrer();
    return () => {
      ignore = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [camera, traiter]);

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    void traiter(manuel);
    setManuel("");
  }

  const pourcent =
    counts.expected > 0
      ? Math.min(100, Math.round((counts.entered / counts.expected) * 100))
      : 0;

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("session")}
        </span>
        <select
          value={sessionId}
          onChange={(e) =>
            router.replace({ pathname: "/door", query: { s: e.target.value } })
          }
          className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-medium outline-none focus:border-ring"
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Users className="size-4" />
            {t("entered")}
          </p>
          <p className="tabular-nums">
            <span className="text-2xl font-extrabold">{counts.entered}</span>
            <span className="text-sm text-muted-foreground">
              {" "}
              {t("expected", { count: counts.expected })}
            </span>
          </p>
        </div>
        <div
          className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
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

      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-[#1E1F23] sm:aspect-video">
        {camera === "on" ? (
          <video
            ref={videoRef}
            className="size-full object-cover"
            playsInline
            muted
          />
        ) : (
          <div className="grid size-full place-items-center px-6 text-center text-white">
            <div>
              <ScanLine className="mx-auto size-10 text-white" />
              <p className="mt-3 text-sm text-white/80">
                {camera === "denied" ? t("cameraDenied") : t("cameraHint")}
              </p>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-x-12 top-1/2 h-px -translate-y-1/2 bg-white/70" />
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={() => setCamera((c) => (c === "on" ? "off" : "on"))}
      >
        <Camera className="size-4" />
        {camera === "on" ? t("stopCamera") : t("startCamera")}
      </Button>

      <form onSubmit={soumettre} className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={manuel}
            onChange={(e) => setManuel(e.target.value.toUpperCase())}
            placeholder={t("manualPlaceholder")}
            aria-label={t("manualPlaceholder")}
            autoCapitalize="characters"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 font-mono text-sm outline-none focus:border-ring"
          />
        </label>
        <Button type="submit" disabled={occupe || !manuel.trim()}>
          {occupe ? <Loader2 className="size-4 animate-spin" /> : t("check")}
        </Button>
      </form>

      <div aria-live="assertive">
        {resultat ? <Resultat lookup={resultat} locale={locale} /> : null}
      </div>
    </div>
  );
}

function Resultat({ lookup, locale }: { lookup: DoorLookup; locale: string }) {
  const t = useTranslations("door");

  if (!lookup.ok) {
    return (
      <div className="rounded-2xl bg-destructive px-4 py-5 text-center text-white">
        <p className="text-xl font-extrabold uppercase">{t("refused")}</p>
        <p className="mt-1 text-sm text-white/90">{t(lookup.reason)}</p>
        {lookup.reason === "otherSession" ? (
          <>
            <p className="mt-2 font-semibold">{lookup.ticket.eventTitle}</p>
            <p className="text-sm text-white/90">
              {lookup.ticket.ticketName} · {lookup.ticket.when}
            </p>
            <p className="mt-2 font-mono text-xs tracking-wider">
              {lookup.ticket.code}
            </p>
          </>
        ) : null}
      </div>
    );
  }

  const deja = lookup.outcome === "already";
  const heure = lookup.usedAt
    ? new Intl.DateTimeFormat(`${locale}-CH`, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: EVENT_TIME_ZONE,
      }).format(new Date(lookup.usedAt))
    : null;

  return (
    <div
      className={`rounded-2xl px-4 py-5 text-center text-white ${
        deja ? "bg-amber-700" : "bg-emerald-700"
      }`}
    >
      <p className="text-xl font-extrabold uppercase">
        {deja ? t("alreadyUsed") : t("admitted")}
      </p>
      {deja && heure ? (
        <p className="mt-1 text-sm font-semibold">{t("usedAt", { time: heure })}</p>
      ) : null}
      <p className="mt-2 font-semibold">{lookup.ticket.eventTitle}</p>
      <p className="text-sm text-white/90">
        {lookup.ticket.ticketName} · {lookup.ticket.when}
      </p>
      <p className="text-sm text-white/90">{lookup.ticket.venue}</p>
      <p className="mt-2 font-mono text-xs tracking-wider">{lookup.ticket.code}</p>
      <p className="mt-1 text-sm">{lookup.ticket.buyer}</p>
    </div>
  );
}
