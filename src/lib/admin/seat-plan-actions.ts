"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import * as z from "zod";
import { requireAdmin } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { readLayout } from "@/lib/seating/layout";
import { failure, readText, slugify, success, type FormState } from "./form";

/**
 * Plans de salle importés depuis le backoffice.
 *
 * Le relevé et les corrections se font dans le navigateur ; le serveur ne
 * reçoit que le plan final, revérifié ici en entier : une action serveur est
 * joignable directement, sans passer par l'éditeur.
 */

const KEY = /^[A-Za-z0-9_-]{1,16}$/;

const name = z.object({
  fr: z.string().trim().min(1).max(80),
  en: z.string().trim().min(1).max(80),
  de: z.string().trim().min(1).max(80),
  it: z.string().trim().min(1).max(80),
});

const layoutSchema = z
  .object({
    viewBox: z.object({
      x: z.number(),
      y: z.number(),
      w: z.number().positive(),
      h: z.number().positive(),
    }),
    seatSize: z.number().positive().max(100),
    zones: z
      .array(
        z.object({
          key: z.string().regex(KEY),
          name,
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        }),
      )
      .min(1)
      .max(30),
    sections: z.array(z.object({ key: z.string().regex(KEY), name })).min(1).max(50),
    seats: z
      .array(
        z.object({
          key: z.string().min(1).max(40),
          section: z.string().regex(KEY),
          row: z.string().trim().min(1).max(8),
          number: z.string().trim().min(1).max(8),
          zone: z.string().regex(KEY),
          x: z.number(),
          y: z.number(),
          rotate: z.number().min(-180).max(180).optional(),
        }),
      )
      .min(1)
      .max(5000),
    marks: z
      .array(z.object({ text: name, x: z.number(), y: z.number(), size: z.number().positive().max(200).optional() }))
      .max(500),
    areas: z
      .array(
        z.object({
          x: z.number(),
          y: z.number(),
          w: z.number().positive(),
          h: z.number().positive(),
          label: name.optional(),
        }),
      )
      .max(50),
    rowNumbers: z.boolean().optional(),
  })
  .superRefine((layout, ctx) => {
    const zones = new Set(layout.zones.map((z) => z.key));
    const sections = new Set(layout.sections.map((s) => s.key));
    const keys = new Set<string>();
    for (const seat of layout.seats) {
      // La référence imprimée sur le billet et vendue une seule fois.
      const expected = `${seat.section}-${seat.row}-${seat.number}`;
      if (seat.key !== expected || keys.has(seat.key)) {
        ctx.addIssue({ code: "custom", message: "seatKey" });
        return;
      }
      keys.add(seat.key);
      if (!zones.has(seat.zone) || !sections.has(seat.section)) {
        ctx.addIssue({ code: "custom", message: "seatRef" });
        return;
      }
    }
  });

function refresh() {
  revalidatePath("/admin/seat-plans");
  revalidatePath("/admin/events");
}

export async function saveSeatPlan(_prev: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();

  const venueId = readText(data, "venueId");
  const planName = readText(data, "name");
  if (planName.length < 2 || planName.length > 120) return failure("nameRequired");

  let raw: unknown;
  try {
    raw = JSON.parse(String(data.get("layout") ?? ""));
  } catch {
    return failure("layoutInvalid");
  }
  const parsed = layoutSchema.safeParse(raw);
  if (!parsed.success) return failure("layoutInvalid");

  const venue = await prisma.venue.findUnique({ where: { id: venueId }, select: { name: true } });
  if (!venue) return failure("venueRequired");

  // Le slug ne sert que de repère stable : un suffixe évite de refuser un
  // deuxième plan du même nom (configuration concert, configuration théâtre).
  const base = slugify(`${venue.name} ${planName}`) || "plan";
  let slug = base;
  for (let i = 2; await prisma.seatPlan.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${i}`;
  }

  try {
    const plan = await prisma.seatPlan.create({
      data: { slug, name: planName, venueId, layout: parsed.data },
    });
    refresh();
    return success(plan.id);
  } catch (error) {
    console.error("[admin] enregistrement plan de salle", error);
    return failure("unavailable");
  }
}

class PlanConflict extends Error {
  constructor(readonly key: "seatsSold" | "zoneInUse") {
    super(key);
  }
}

/**
 * Modifie un plan, même déjà en vente : chaque séance qui l'utilise suit.
 *
 * Une place vendue ou retenue garde sa référence (elle est imprimée sur le
 * billet) : la supprimer ou la renuméroter est refusé. Les places retirées
 * libres ou bloquées disparaissent des séances, les nouvelles y sont créées.
 */
export async function updateSeatPlan(_prev: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();

  const id = readText(data, "id");
  const planName = readText(data, "name");
  if (planName.length < 2 || planName.length > 120) return failure("nameRequired");

  let raw: unknown;
  try {
    raw = JSON.parse(String(data.get("layout") ?? ""));
  } catch {
    return failure("layoutInvalid");
  }
  const parsed = layoutSchema.safeParse(raw);
  if (!parsed.success) return failure("layoutInvalid");
  const layout = parsed.data;

  const plan = await prisma.seatPlan.findUnique({
    where: { id },
    select: { layout: true, sessions: { select: { id: true, capacity: true, sold: true } } },
  });
  if (!plan) return failure("notFound");

  const keys = layout.seats.map((s) => s.key);
  const zones = new Set(layout.zones.map((z) => z.key));
  const sessionIds = plan.sessions.map((s) => s.id);
  const previousCount = readLayout(plan.layout)?.seats.length ?? 0;

  try {
    await prisma.$transaction(
      async (tx) => {
        const tariffs = await tx.ticketType.findMany({
          where: { sessionId: { in: sessionIds }, NOT: { seatZones: { isEmpty: true } } },
          select: { seatZones: true },
        });
        if (tariffs.some((t) => t.seatZones.some((z) => !zones.has(z)))) {
          throw new PlanConflict("zoneInUse");
        }

        await tx.sessionSeat.deleteMany({
          where: {
            sessionId: { in: sessionIds },
            seatKey: { notIn: keys },
            status: { in: ["AVAILABLE", "BLOCKED"] },
          },
        });
        const orphan = await tx.sessionSeat.count({
          where: { sessionId: { in: sessionIds }, seatKey: { notIn: keys } },
        });
        if (orphan > 0) throw new PlanConflict("seatsSold");

        await tx.seatPlan.update({ where: { id }, data: { name: planName, layout } });

        const byZone = new Map<string, string[]>();
        for (const seat of layout.seats) byZone.set(seat.zone, [...(byZone.get(seat.zone) ?? []), seat.key]);
        for (const [zone, zoneKeys] of byZone) {
          await tx.sessionSeat.updateMany({
            where: { sessionId: { in: sessionIds }, seatKey: { in: zoneKeys }, NOT: { zone } },
            data: { zone },
          });
        }

        for (const session of plan.sessions) {
          await tx.sessionSeat.createMany({
            data: layout.seats.map((s) => ({ sessionId: session.id, seatKey: s.key, zone: s.zone })),
            skipDuplicates: true,
          });
          // Une jauge réglée sur tout le plan suit le plan ; une jauge réduite
          // à la main n'est touchée que si elle dépasse les places restantes.
          if (session.capacity === null) continue;
          const followsPlan = session.capacity === previousCount;
          const capacity = followsPlan ? keys.length : Math.min(session.capacity, keys.length);
          if (capacity !== session.capacity) {
            await tx.eventSession.update({
              where: { id: session.id },
              data: { capacity: Math.max(capacity, session.sold) },
            });
          }
        }
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    if (error instanceof PlanConflict) return failure(error.key);
    console.error("[admin] modification plan de salle", error);
    return failure("unavailable");
  }

  refresh();
  revalidatePath(`/admin/seat-plans/${id}`);
  return success(id);
}

/** Copie d'un plan, pour une autre disposition de la même salle. */
export async function duplicateSeatPlan(_prev: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const id = readText(data, "id");
  const copyName = readText(data, "name");
  if (copyName.length < 2 || copyName.length > 120) return failure("nameRequired");

  const plan = await prisma.seatPlan.findUnique({
    where: { id },
    select: { layout: true, venueId: true, venue: { select: { name: true } } },
  });
  if (!plan) return failure("notFound");

  const base = slugify(`${plan.venue.name} ${copyName}`) || "plan";
  let slug = base;
  for (let i = 2; await prisma.seatPlan.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${i}`;
  }

  try {
    const copy = await prisma.seatPlan.create({
      data: { slug, name: copyName, venueId: plan.venueId, layout: plan.layout as Prisma.InputJsonValue },
    });
    refresh();
    return success(copy.id);
  } catch (error) {
    console.error("[admin] copie plan de salle", error);
    return failure("unavailable");
  }
}

export async function deleteSeatPlan(_prev: FormState, data: FormData): Promise<FormState> {
  await requireAdmin();
  const id = readText(data, "id");
  if (!id) return failure("notFound");

  // Des séances vendent sur ce plan : le retirer effacerait la référence des
  // places de billets déjà émis.
  const sessions = await prisma.eventSession.count({ where: { seatPlanId: id } });
  if (sessions > 0) return failure("planInUse");

  try {
    await prisma.seatPlan.delete({ where: { id } });
    refresh();
    return success();
  } catch (error) {
    console.error("[admin] suppression plan de salle", error);
    return failure("unavailable");
  }
}

export interface PlanReading {
  venue: string | null;
  legend: { name: string; color: string; count: number | null }[];
  sections: string[];
  total: number | null;
}

const readingSchema = z.object({
  venue: z.string().max(200).nullish(),
  legend: z
    .array(
      z.object({
        name: z.string().max(120),
        color: z.string().max(40),
        count: z.number().int().nonnegative().nullish(),
      }),
    )
    .max(30)
    .default([]),
  sections: z.array(z.string().max(120)).max(50).default([]),
  total: z.number().int().nonnegative().nullish(),
});

const PROMPT = `Plan de salle de spectacle. Lis-le et réponds UNIQUEMENT en JSON :
{"venue": nom de la salle ou null,
 "legend": [{"name": nom de la catégorie tel qu'imprimé, "color": couleur en anglais (yellow, red, blue, pink, green, orange, purple, grey…), "count": nombre de places annoncé ou null}],
 "sections": [noms des zones de la salle imprimés sur le plan, ex. "Parterre", "Balcon", "Chor"],
 "total": total de places annoncé ou null}`;

/**
 * Lecture de la légende et des zones par le modèle de vision du GB10, via
 * aimanager. Facultative : sans configuration ou en cas d'échec, l'éditeur
 * garde les noms relevés automatiquement.
 */
export async function readPlanWithAi(image: string): Promise<PlanReading | null> {
  await requireAdmin();

  const url = process.env.LITELLM_API_URL?.trim();
  const key = process.env.LITELLM_API_KEY?.trim();
  if (!url || !key) return null;
  if (!image.startsWith("data:image/jpeg;base64,") || image.length > 900_000) return null;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.PLAN_AI_MODEL?.trim() || "ollama_chat/gemma4:12b",
        temperature: 0,
        // Sans ce réglage, gemma4 réfléchit une minute avant de répondre.
        reasoning_effort: "none",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.error("[admin] lecture du plan par l'IA", res.status);
      return null;
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = body.choices?.[0]?.message?.content ?? "";
    const parsed = readingSchema.safeParse(JSON.parse(content));
    if (!parsed.success) return null;
    return {
      venue: parsed.data.venue ?? null,
      legend: parsed.data.legend.map((l) => ({ ...l, count: l.count ?? null })),
      sections: parsed.data.sections,
      total: parsed.data.total ?? null,
    };
  } catch (error) {
    console.error("[admin] lecture du plan par l'IA", error);
    return null;
  }
}
