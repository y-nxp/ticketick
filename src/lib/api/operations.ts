import "server-only";

import type * as z from "zod";
import { schemas } from "./input";
import * as service from "./service";
import type { ApiActor } from "./service";

/**
 * Registre de l'API publique : chaque opération est décrite une fois et
 * sert à la fois de route REST (`/api/v1`), d'outil MCP (`/api/mcp`) et
 * d'entrée de la spécification OpenAPI.
 */

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export type Operation<S extends z.ZodType = z.ZodType> = {
  /** Nom de l'outil MCP et `operationId` OpenAPI. */
  name: string;
  title: string;
  description: string;
  method: Method;
  /** Chemin sous `/api/v1`, paramètres entre accolades. */
  path: string;
  tag: "Organizer" | "Events" | "Sessions" | "Ticket types" | "Reference" | "Public catalogue";
  /** `public` : sans clé. */
  auth: "key" | "public";
  input: S;
  /** Création : `Idempotency-Key` accepté, réponse 201. */
  creates?: boolean;
  readOnly?: boolean;
  destructive?: boolean;
  run: (actor: ApiActor | null, input: z.infer<S>) => Promise<object> | object;
};

function op<S extends z.ZodType>(o: Operation<S>): Operation {
  return o as unknown as Operation;
}

const need = (actor: ApiActor | null): ApiActor => actor!;

export const OPERATIONS: Operation[] = [
  op({
    name: "whoami",
    title: "Who am I",
    description:
      "Organizer account and permissions of the API key. Call it first: it states the rules (drafts, publish permission, time zone, currency).",
    method: "GET",
    path: "/me",
    tag: "Organizer",
    auth: "key",
    input: schemas.empty,
    readOnly: true,
    run: (actor) => service.whoami(need(actor)),
  }),
  op({
    name: "list_events",
    title: "List my events",
    description: "Events of the organizer (drafts included), newest first, with status, next session and tickets sold.",
    method: "GET",
    path: "/events",
    tag: "Events",
    auth: "key",
    input: schemas.listEvents,
    readOnly: true,
    run: (actor, i) => service.listEvents(need(actor), i.status),
  }),
  op({
    name: "get_event",
    title: "Get an event",
    description: "Full event: texts, payment, sessions, venues, ticket types, sales counters and links (public page, admin).",
    method: "GET",
    path: "/events/{eventId}",
    tag: "Events",
    auth: "key",
    input: schemas.eventRef,
    readOnly: true,
    run: (actor, i) => service.getEvent(need(actor), i.eventId),
  }),
  op({
    name: "create_event",
    title: "Create an event",
    description:
      "Create an event with, in the same call, its sessions (dates, venue, capacity) and ticket types (prices in CHF). It is a draft unless publish is true and the key may publish. Times without offset are Swiss local time. Texts are per language ({ fr, en, de, it }); give at least one. Returns the event with its admin link for review.",
    method: "POST",
    path: "/events",
    tag: "Events",
    auth: "key",
    input: schemas.createEvent,
    creates: true,
    run: (actor, i) => service.createEvent(need(actor), i),
  }),
  op({
    name: "update_event",
    title: "Update an event",
    description:
      "Change texts, categories, visibility, payment methods, contact or cover image. Only the given fields change. A key without publish permission may only change drafts.",
    method: "PATCH",
    path: "/events/{eventId}",
    tag: "Events",
    auth: "key",
    input: schemas.updateEvent,
    run: (actor, i) => service.updateEvent(need(actor), i),
  }),
  op({
    name: "delete_event",
    title: "Delete a draft event",
    description: "Delete a draft event without sales, with its sessions and ticket types.",
    method: "DELETE",
    path: "/events/{eventId}",
    tag: "Events",
    auth: "key",
    input: schemas.eventRef,
    destructive: true,
    run: (actor, i) => service.deleteEvent(need(actor), i.eventId),
  }),
  op({
    name: "publish_event",
    title: "Publish an event",
    description:
      "Put the event online (status PUBLISHED). Needs a key with publish permission, an upcoming session and, for online sale, a ticket type.",
    method: "POST",
    path: "/events/{eventId}/publish",
    tag: "Events",
    auth: "key",
    input: schemas.eventRef,
    run: (actor, i) => service.publishEvent(need(actor), i.eventId),
  }),
  op({
    name: "unpublish_event",
    title: "Unpublish an event",
    description: "Turn an event without sales back into a draft. Needs a key with publish permission.",
    method: "POST",
    path: "/events/{eventId}/unpublish",
    tag: "Events",
    auth: "key",
    input: schemas.eventRef,
    run: (actor, i) => service.unpublishEvent(need(actor), i.eventId),
  }),
  op({
    name: "add_session",
    title: "Add a session",
    description: "Add a dated session (performance) to an event, with its venue, capacity and ticket types.",
    method: "POST",
    path: "/events/{eventId}/sessions",
    tag: "Sessions",
    auth: "key",
    input: schemas.addSession,
    creates: true,
    run: (actor, i) => service.addSession(need(actor), i),
  }),
  op({
    name: "update_session",
    title: "Update a session",
    description:
      "Change a session's times, label, venue or capacity. A session with sold tickets keeps its date and venue (use « Programme modifié » in the admin). null clears an optional field.",
    method: "PATCH",
    path: "/sessions/{sessionId}",
    tag: "Sessions",
    auth: "key",
    input: schemas.updateSession,
    run: (actor, i) => service.updateSession(need(actor), i),
  }),
  op({
    name: "delete_session",
    title: "Delete a session",
    description: "Delete a session without sales.",
    method: "DELETE",
    path: "/sessions/{sessionId}",
    tag: "Sessions",
    auth: "key",
    input: schemas.sessionRef,
    destructive: true,
    run: (actor, i) => service.deleteSession(need(actor), i.sessionId),
  }),
  op({
    name: "add_ticket_type",
    title: "Add a ticket type",
    description: "Add a ticket type (price in CHF, quantity) to a session.",
    method: "POST",
    path: "/sessions/{sessionId}/ticket-types",
    tag: "Ticket types",
    auth: "key",
    input: schemas.addTicketType,
    creates: true,
    run: (actor, i) => service.addTicketType(need(actor), i),
  }),
  op({
    name: "update_ticket_type",
    title: "Update a ticket type",
    description: "Change a ticket type's name, price, quantity (not below sold), limit per order or sales window.",
    method: "PATCH",
    path: "/ticket-types/{ticketTypeId}",
    tag: "Ticket types",
    auth: "key",
    input: schemas.updateTicketType,
    run: (actor, i) => service.updateTicketType(need(actor), i),
  }),
  op({
    name: "delete_ticket_type",
    title: "Delete a ticket type",
    description: "Delete a ticket type without sales.",
    method: "DELETE",
    path: "/ticket-types/{ticketTypeId}",
    tag: "Ticket types",
    auth: "key",
    input: schemas.ticketTypeRef,
    destructive: true,
    run: (actor, i) => service.deleteTicketType(need(actor), i.ticketTypeId),
  }),
  op({
    name: "list_venues",
    title: "List venues",
    description:
      "Venues already used by the organizer, or search all ticketick venues by name or city with q. Reuse a venueId rather than creating a duplicate venue.",
    method: "GET",
    path: "/venues",
    tag: "Reference",
    auth: "key",
    input: schemas.listVenues,
    readOnly: true,
    run: (actor, i) => service.listVenues(need(actor), i.q),
  }),
  op({
    name: "list_categories",
    title: "List categories",
    description: "Event categories (slug and names) to use in create_event.",
    method: "GET",
    path: "/categories",
    tag: "Reference",
    auth: "key",
    input: schemas.empty,
    readOnly: true,
    run: () => service.listCategories(),
  }),
  op({
    name: "search_events",
    title: "Search events on sale",
    description:
      "Public catalogue of ticketick.ch: upcoming concerts, festivals, theatre and shows in Switzerland, with dates, venues, prices, availability and booking links. No API key needed.",
    method: "GET",
    path: "/public/events",
    tag: "Public catalogue",
    auth: "public",
    input: schemas.searchPublic,
    readOnly: true,
    run: (_actor, i) => service.searchPublicEvents(i),
  }),
  op({
    name: "get_public_event",
    title: "Get a public event",
    description: "Public details of an event on ticketick.ch: full description, upcoming sessions, ticket prices, availability and booking link. No API key needed.",
    method: "GET",
    path: "/public/events/{slug}",
    tag: "Public catalogue",
    auth: "public",
    input: schemas.publicEvent,
    readOnly: true,
    run: (_actor, i) => service.getPublicEvent(i.slug, i.locale),
  }),
];

/** Paramètres de chemin d'une opération (`/events/{eventId}` → `eventId`). */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

/** Opération et paramètres de chemin correspondant à une requête REST. */
export function matchOperation(
  method: string,
  path: string,
): { op: Operation; params: Record<string, string> } | { allowed: Method[] } | null {
  const allowed: Method[] = [];
  for (const o of OPERATIONS) {
    const names = pathParams(o.path);
    const pattern = new RegExp(`^${o.path.replace(/\{\w+\}/g, "([^/]+)")}$`);
    const m = pattern.exec(path);
    if (!m) continue;
    if (o.method !== method) {
      allowed.push(o.method);
      continue;
    }
    const params = Object.fromEntries(names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    return { op: o, params };
  }
  return allowed.length ? { allowed } : null;
}
