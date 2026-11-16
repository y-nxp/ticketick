/**
 * Contrôle sans attendre le réseau.
 *
 * Le téléphone garde la liste des billets de la séance (`DoorSnapshot`) et
 * décide sur place. Les entrées validées partent dans une file (`pending`),
 * envoyée au serveur dès que possible ; la liste est relue à chaque
 * synchronisation. Un billet absent de la liste (acheté à l'instant, autre
 * séance, faute de frappe) est demandé au serveur.
 *
 * Tout ici est pur, sauf les fonctions de stockage en bas, qui tolèrent un
 * stockage indisponible (navigation privée, quota).
 */

import type { DoorLookup, DoorSnapshot, DoorSnapshotTicket, DoorTicket } from "./actions";

export type ScanMode = "entry" | "check";

/** Résultat affiché : celui du serveur, ou « à vérifier » faute de réseau. */
export type ScanLookup = DoorLookup | { ok: false; reason: "offlineUnknown" };

export interface PendingEntry {
  code: string;
  /** Heure du scan sur le téléphone (ISO). */
  at: string;
}

/** Billet validé sur ce téléphone, mais que le serveur a refusé ou vu passer ailleurs. */
export interface DoorConflict {
  code: string;
  buyer: string | null;
  kind: "already" | "refused";
  usedAt: string | null;
  reason?: "unknown" | "cancelled" | "unpaid";
}

export type LocalResult =
  | { kind: "missing" }
  | { kind: "found"; lookup: DoorLookup; admit: boolean };

export function indexSnapshot(snapshot: DoorSnapshot | null): Map<string, DoorSnapshotTicket> {
  return new Map((snapshot?.tickets ?? []).map((t) => [t.code, t]));
}

function ticketInfo(snapshot: DoorSnapshot, t: DoorSnapshotTicket): DoorTicket {
  return {
    code: t.code,
    eventTitle: snapshot.eventTitle,
    ticketName: t.ticketName,
    when: snapshot.when,
    venue: snapshot.venue,
    buyer: t.buyer,
    seat: t.seat,
    attendee: t.attendee,
    attendeeBirthDate: t.attendeeBirthDate,
  };
}

/**
 * Décide sur le téléphone. `admit` : l'entrée est à enregistrer (file d'envoi).
 */
export function localLookup(
  snapshot: DoorSnapshot | null,
  index: Map<string, DoorSnapshotTicket>,
  pending: PendingEntry[],
  code: string,
  mode: ScanMode,
): LocalResult {
  const ticket = snapshot ? index.get(code) : undefined;
  if (!snapshot || !ticket) return { kind: "missing" };
  const info = ticketInfo(snapshot, ticket);

  if (ticket.status === "X") {
    return { kind: "found", admit: false, lookup: { ok: false, reason: "cancelled" } };
  }
  if (ticket.status === "P") {
    return { kind: "found", admit: false, lookup: { ok: false, reason: "unpaid" } };
  }
  const local = pending.find((p) => p.code === code);
  if (local || ticket.status === "U") {
    return {
      kind: "found",
      admit: false,
      lookup: { ok: true, outcome: "already", usedAt: local?.at ?? ticket.usedAt, ticket: info },
    };
  }
  return mode === "entry"
    ? { kind: "found", admit: true, lookup: { ok: true, outcome: "admitted", usedAt: null, ticket: info } }
    : { kind: "found", admit: false, lookup: { ok: true, outcome: "valid", usedAt: null, ticket: info } };
}

/** Entrés et attendus, d'après la liste et les entrées pas encore envoyées. */
export function localCounts(
  snapshot: DoorSnapshot,
  index: Map<string, DoorSnapshotTicket>,
  pending: PendingEntry[],
): { entered: number; expected: number } {
  let entered = 0;
  let expected = 0;
  for (const t of snapshot.tickets) {
    if (t.status === "U") entered += 1;
    if (t.status === "U" || t.status === "V") expected += 1;
  }
  for (const p of pending) {
    if (index.get(p.code)?.status === "V") entered += 1;
  }
  return { entered, expected };
}

// --- Stockage sur l'appareil ------------------------------------------------

const PREFIX = "ticketick.door.v1:";
const snapKey = (sessionId: string) => `${PREFIX}snap:${sessionId}`;
const queueKey = (sessionId: string) => `${PREFIX}queue:${sessionId}`;

export interface StoredQueue {
  pending: PendingEntry[];
  conflicts: DoorConflict[];
}

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage plein ou interdit : l'app continue, sans reprise après fermeture.
  }
}

export function loadSnapshot(sessionId: string): { snapshot: DoorSnapshot; syncedAt: number } | null {
  return read(snapKey(sessionId));
}

export function saveSnapshot(snapshot: DoorSnapshot, syncedAt: number): void {
  write(snapKey(snapshot.sessionId), { snapshot, syncedAt });
}

export function loadQueue(sessionId: string): StoredQueue {
  return read<StoredQueue>(queueKey(sessionId)) ?? { pending: [], conflicts: [] };
}

export function saveQueue(sessionId: string, queue: StoredQueue): void {
  write(queueKey(sessionId), queue);
}

/** Entrées pas encore envoyées, toutes séances confondues. */
export function pendingTotal(): number {
  try {
    let n = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(`${PREFIX}queue:`)) {
        n += read<StoredQueue>(key)?.pending.length ?? 0;
      }
    }
    return n;
  } catch {
    return 0;
  }
}

/**
 * Efface les listes de billets (noms des acheteurs) : à la déconnexion, et
 * pour les séances qui ne sont plus à contrôler. Une séance dont des entrées
 * attendent encore l'envoi est gardée, sauf `all`.
 */
export function clearDoorStorage(keepSessionIds: string[] | "none", all = false): void {
  try {
    const keep = new Set(keepSessionIds === "none" ? [] : keepSessionIds);
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const sessionId = key.slice(key.lastIndexOf(":") + 1);
      if (keep.has(sessionId)) continue;
      if (!all && (read<StoredQueue>(queueKey(sessionId))?.pending.length ?? 0) > 0) continue;
      window.localStorage.removeItem(key);
    }
  } catch {
    // Rien à effacer si le stockage est inaccessible.
  }
}
