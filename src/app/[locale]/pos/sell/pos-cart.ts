"use client";

import * as React from "react";

/**
 * Vente en cours au guichet, sur plusieurs concerts : chaque concert choisi
 * attend ici, dans ce navigateur, que le vendeur encaisse le tout en une
 * fois. Les sièges ne sont pas retenus entre-temps ; ils sont vérifiés à
 * l'encaissement.
 */

export interface CartLine {
  ticketTypeId: string;
  name: string;
  quantity: number;
  priceCents: number;
  seatKeys?: string[];
}

export interface CartAttendee {
  ticketTypeId: string;
  name: string;
  birthDate: string;
}

export interface CartPart {
  sessionId: string;
  title: string;
  /** Date et lieu, déjà mis en forme. */
  when: string;
  seatMode: "plan" | "auto";
  lines: CartLine[];
  attendees: CartAttendee[];
}

interface Stored {
  agentId: string;
  savedAt: number;
  parts: CartPart[];
}

/** Une vente oubliée ne revient pas le lendemain. */
const TTL_MS = 3 * 60 * 60 * 1000;
const KEY = "ticketick.pos.cart";
const EVENT = "ticketick:pos-cart";
const EMPTY: CartPart[] = [];

let cache: { raw: string | null; parts: CartPart[] } = { raw: null, parts: EMPTY };

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null, agentId: string): CartPart[] {
  if (raw !== cache.raw) {
    let parts = EMPTY;
    try {
      const stored = raw ? (JSON.parse(raw) as Stored) : null;
      if (stored && Date.now() - stored.savedAt < TTL_MS && Array.isArray(stored.parts)) {
        parts = stored.agentId === agentId ? stored.parts : EMPTY;
      }
    } catch {
      parts = EMPTY;
    }
    cache = { raw, parts };
  }
  return cache.parts;
}

function write(agentId: string, parts: CartPart[]): void {
  try {
    if (parts.length === 0) window.localStorage.removeItem(KEY);
    else {
      const stored: Stored = { agentId, savedAt: Date.now(), parts };
      window.localStorage.setItem(KEY, JSON.stringify(stored));
    }
  } catch {
    // Stockage indisponible : la vente se fait alors concert par concert.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function usePosCart(agentId: string) {
  const parts = React.useSyncExternalStore(
    subscribe,
    () => parse(readRaw(), agentId),
    () => EMPTY,
  );
  return {
    parts,
    /** Ajoute un concert, ou remplace sa sélection s'il y est déjà. */
    put(part: CartPart) {
      const rest = parse(readRaw(), agentId).filter((p) => p.sessionId !== part.sessionId);
      write(agentId, part.lines.length ? [...rest, part] : rest);
    },
    remove(sessionId: string) {
      write(agentId, parse(readRaw(), agentId).filter((p) => p.sessionId !== sessionId));
    },
    clear() {
      write(agentId, []);
    },
  };
}

export function partTotal(part: CartPart): number {
  return part.lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
}

export function partCount(part: CartPart): number {
  return part.lines.reduce((sum, l) => sum + l.quantity, 0);
}
