"use client";

import * as React from "react";
import { doorPush, doorSnapshot, type DoorSnapshot } from "@/lib/door/actions";
import {
  indexSnapshot,
  loadQueue,
  loadSnapshot,
  localCounts,
  localLookup,
  saveQueue,
  saveSnapshot,
  type DoorConflict,
  type LocalResult,
  type PendingEntry,
  type ScanMode,
} from "@/lib/door/offline";

/** Synchronisation régulière tant que l'app est à l'écran. */
const SYNC_MS = 20_000;
const PUSH_TIMEOUT_MS = 15_000;
const SNAPSHOT_TIMEOUT_MS = 25_000;

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        window.clearTimeout(id);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(id);
        reject(error);
      },
    );
  });
}

export interface DoorSyncState {
  snapshot: DoorSnapshot | null;
  /** Dernière synchronisation réussie (horloge du téléphone, ms). */
  syncedAt: number | null;
  pending: PendingEntry[];
  conflicts: DoorConflict[];
  /** Résultat de la dernière tentative : réseau et serveur joignables. */
  online: boolean;
  syncing: boolean;
}

const EMPTY: DoorSyncState = {
  snapshot: null,
  syncedAt: null,
  pending: [],
  conflicts: [],
  online: true,
  syncing: false,
};

export function useDoorSync(sessionId: string, locale: string) {
  const [state, setState] = React.useState<DoorSyncState>(EMPTY);
  const ref = React.useRef<DoorSyncState>(EMPTY);
  const syncing = React.useRef(false);
  const again = React.useRef(false);
  const indexRef = React.useRef(indexSnapshot(null));

  const commit = React.useCallback(
    (patch: Partial<DoorSyncState>) => {
      const next = { ...ref.current, ...patch };
      ref.current = next;
      if ("snapshot" in patch) indexRef.current = indexSnapshot(next.snapshot);
      setState(next);
      if ("pending" in patch || "conflicts" in patch) {
        saveQueue(sessionId, { pending: next.pending, conflicts: next.conflicts });
      }
    },
    [sessionId],
  );

  /** Un passage : envoyer la file, puis relire la liste. */
  const syncOnce = React.useCallback(async (): Promise<void> => {
    try {
      // 1. Envoyer les entrées validées sur le téléphone.
      const sent = ref.current.pending.slice(0, 500);
      if (sent.length > 0) {
        const results = await withTimeout(doorPush(sessionId, sent), PUSH_TIMEOUT_MS);
        if (!results) throw new Error("forbidden");
        const index = indexRef.current;
        const done = new Set(results.map((r) => r.code));
        const conflicts: DoorConflict[] = results.flatMap((r): DoorConflict[] =>
          r.result === "ok"
            ? []
            : [
                {
                  code: r.code,
                  buyer: index.get(r.code)?.buyer ?? null,
                  kind: r.result,
                  usedAt: r.result === "already" ? r.usedAt : null,
                  reason: r.result === "refused" ? r.reason : undefined,
                },
              ],
        );
        commit({
          pending: ref.current.pending.filter((p) => !done.has(p.code)),
          conflicts: [...ref.current.conflicts, ...conflicts],
        });
      }
      // 2. Relire la liste : achats, annulations, passages sur d'autres appareils.
      const snapshot = await withTimeout(doorSnapshot(sessionId, locale), SNAPSHOT_TIMEOUT_MS);
      if (!snapshot) throw new Error("forbidden");
      const syncedAt = Date.now();
      saveSnapshot(snapshot, syncedAt);
      commit({ snapshot, syncedAt, online: true });
    } catch {
      commit({ online: false });
    }
  }, [sessionId, locale, commit]);

  /** Une seule synchronisation à la fois ; une demande pendant ce temps en relance une à la fin. */
  const sync = React.useCallback(async (): Promise<void> => {
    if (syncing.current) {
      again.current = true;
      return;
    }
    syncing.current = true;
    commit({ syncing: true });
    try {
      do {
        again.current = false;
        await syncOnce();
      } while (again.current && ref.current.online);
    } finally {
      syncing.current = false;
      commit({ syncing: false });
    }
  }, [commit, syncOnce]);

  // Ouverture : la liste gardée sur le téléphone sert tout de suite, puis on
  // synchronise.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const stored = loadSnapshot(sessionId);
      const queue = loadQueue(sessionId);
      commit({
        snapshot: stored?.snapshot ?? null,
        syncedAt: stored?.syncedAt ?? null,
        pending: queue.pending,
        conflicts: queue.conflicts,
        online: navigator.onLine,
      });
      await sync();
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, commit, sync]);

  // Ensuite : toutes les 20 s à l'écran, au retour du réseau, au retour dans l'app.
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void sync();
    };
    const offline = () => commit({ online: false });
    const id = window.setInterval(tick, SYNC_MS);
    window.addEventListener("online", tick);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", tick);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [sync, commit]);

  const index = React.useMemo(() => indexSnapshot(state.snapshot), [state.snapshot]);

  const lookup = React.useCallback(
    (code: string, mode: ScanMode): LocalResult =>
      localLookup(ref.current.snapshot, indexRef.current, ref.current.pending, code, mode),
    [],
  );

  /** Entrée validée sur le téléphone : enregistrée tout de suite, envoyée aussitôt que possible. */
  const recordAdmission = React.useCallback(
    (code: string) => {
      commit({ pending: [...ref.current.pending, { code, at: new Date().toISOString() }] });
      void sync();
    },
    [commit, sync],
  );

  const clearConflicts = React.useCallback(() => commit({ conflicts: [] }), [commit]);

  const counts = state.snapshot ? localCounts(state.snapshot, index, state.pending) : null;

  return { state, counts, lookup, recordAdmission, sync, clearConflicts };
}
