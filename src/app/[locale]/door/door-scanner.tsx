"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import jsQR from "jsqr";
import { Camera, Keyboard, Loader2, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { admitTicket, type DoorLookup } from "@/lib/door/actions";

export function DoorScanner() {
  const t = useTranslations("door");
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [manuel, setManuel] = React.useState("");
  const [resultat, setResultat] = React.useState<DoorLookup | null>(null);
  const [occupe, setOccupe] = React.useState(false);
  const [camera, setCamera] = React.useState<"off" | "on" | "denied">("off");
  const dernier = React.useRef("");
  const occupeRef = React.useRef(false);

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
  }, [camera]);

  async function traiter(brut: string) {
    const code = brut.trim().toUpperCase();
    if (!code || code === dernier.current || occupeRef.current) return;
    dernier.current = code;
    occupeRef.current = true;
    setOccupe(true);
    try {
      const next = await admitTicket(code);
      setResultat(next);
      if (navigator.vibrate) navigator.vibrate(next.ok && next.status === "USED" ? 40 : 120);
    } finally {
      occupeRef.current = false;
      setOccupe(false);
      window.setTimeout(() => {
        if (dernier.current === code) dernier.current = "";
      }, 2500);
    }
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    void traiter(manuel);
    setManuel("");
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-[#1E1F23] aspect-[3/4] sm:aspect-video">
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
              <ScanLine className="mx-auto size-10 text-[#6C5CE7]" />
              <p className="mt-3 text-sm text-white/80">
                {camera === "denied" ? t("cameraDenied") : t("cameraHint")}
              </p>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        <div className="pointer-events-none absolute inset-x-12 top-1/2 h-px -translate-y-1/2 bg-[#6C5CE7]/80" />
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          className="flex-1"
          onClick={() => setCamera((c) => (c === "on" ? "off" : "on"))}
        >
          <Camera className="size-4" />
          {camera === "on" ? t("stopCamera") : t("startCamera")}
        </Button>
      </div>

      <form onSubmit={soumettre} className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <Keyboard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={manuel}
            onChange={(e) => setManuel(e.target.value.toUpperCase())}
            placeholder={t("manualPlaceholder")}
            autoCapitalize="characters"
            className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 font-mono text-sm outline-none focus:border-ring"
          />
        </label>
        <Button type="submit" disabled={occupe || !manuel.trim()}>
          {occupe ? <Loader2 className="size-4 animate-spin" /> : t("check")}
        </Button>
      </form>

      {resultat ? <Resultat lookup={resultat} /> : null}
    </div>
  );
}

function Resultat({ lookup }: { lookup: DoorLookup }) {
  const t = useTranslations("door");

  if (!lookup.ok) {
    const motif =
      lookup.reason === "cancelled"
        ? t("cancelled")
        : lookup.reason === "unpaid"
          ? t("unpaid")
          : lookup.reason === "forbidden"
            ? t("forbidden")
            : t("unknown");
    return (
      <div className="rounded-2xl bg-destructive px-4 py-5 text-center text-white">
        <p className="text-xl font-extrabold uppercase">{t("refused")}</p>
        <p className="mt-1 text-sm text-white/90">{motif}</p>
      </div>
    );
  }

  const deja = lookup.status === "USED" && lookup.usedAt;
  return (
    <div
      className={`rounded-2xl px-4 py-5 text-center text-white ${
        deja ? "bg-amber-600" : "bg-emerald-600"
      }`}
    >
      <p className="text-xl font-extrabold uppercase">
        {deja ? t("alreadyUsed") : t("admitted")}
      </p>
      <p className="mt-2 font-semibold">{lookup.eventTitle}</p>
      <p className="text-sm text-white/90">
        {lookup.ticketName} · {lookup.when}
      </p>
      <p className="text-sm text-white/90">{lookup.venue}</p>
      <p className="mt-2 font-mono text-xs tracking-wider">{lookup.code}</p>
      <p className="mt-1 text-sm">{lookup.buyer}</p>
    </div>
  );
}
