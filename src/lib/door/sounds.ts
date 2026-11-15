/**
 * Sons de l'app de contrôle, générés à la volée (aucun fichier à charger).
 *
 * Les navigateurs mobiles n'autorisent le son qu'après un geste : `unlockSounds`
 * est appelé à chaque toucher (bouton, choix du mode…), le premier suffit.
 * Sur iPhone, la session audio « playback » fait sonner l'app même quand le
 * téléphone est en mode silencieux : à l'entrée, on veut entendre le résultat.
 */

export type DoorSound = "admitted" | "valid" | "already" | "refused";

let ctx: AudioContext | null = null;

export function unlockSounds(): void {
  if (typeof window === "undefined") return;
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

/** Une note : fréquence (Hz), début et durée (s), forme d'onde. */
type Note = [freq: number, start: number, length: number, wave?: OscillatorType];

const MELODIES: Record<DoorSound, Note[]> = {
  // Deux notes montantes, brèves : « c'est bon ».
  admitted: [
    [880, 0, 0.09],
    [1320, 0.1, 0.16],
  ],
  // Mode vérification : deux notes égales, plus douces, distinctes de l'entrée.
  valid: [
    [990, 0, 0.08],
    [990, 0.13, 0.08],
  ],
  // Déjà passé : trois bips moyens, insistants.
  already: [
    [620, 0, 0.1, "square"],
    [620, 0.16, 0.1, "square"],
    [620, 0.32, 0.1, "square"],
  ],
  // Refusé : note grave et longue.
  refused: [
    [196, 0, 0.5, "sawtooth"],
  ],
};

export function playSound(kind: DoorSound): void {
  if (!ctx || ctx.state !== "running") return;
  try {
    const now = ctx.currentTime + 0.01;
    for (const [freq, start, length, wave = "sine"] of MELODIES[kind]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      const peak = wave === "sine" ? 0.35 : 0.12;
      const t0 = now + start;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      gain.gain.setValueAtTime(peak, t0 + length - 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + length + 0.02);
    }
  } catch {
    // Le son est un plus : l'écran et la vibration suffisent.
  }
}

/** Son et vibration correspondant à un résultat de scan. */
export function soundOf(lookup: {
  ok: boolean;
  outcome?: "admitted" | "valid" | "already";
}): DoorSound {
  if (!lookup.ok) return "refused";
  return lookup.outcome ?? "refused";
}

const STORAGE_KEY = "ticketick.door.sound";

export function readSoundPref(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function writeSoundPref(on: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    // Préférence non retenue : le son revient activé à la prochaine ouverture.
  }
}
