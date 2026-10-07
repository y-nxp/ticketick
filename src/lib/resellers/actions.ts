"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import * as z from "zod";
import { locales } from "@/i18n/routing";
import { catalogActor } from "@/lib/admin/access";
import {
  failure,
  readBoolean,
  readMoneyCents,
  readText,
  slugify,
  success,
  type FormState,
} from "@/lib/admin/form";
import { publicAppOrigin } from "@/lib/app-url";
import { requireResellerAgent } from "@/lib/auth/dal";
import { destroyAllSessions } from "@/lib/auth/session";
import { sendResellerAgentInvitationEmail } from "@/lib/email";
import { payUrlFor, sendPaymentLinkEmail } from "@/lib/email/charge-mail";
import { sendPaidOrderTickets } from "@/lib/email/ticket-mail";
import type { AttendeeInput } from "@/lib/orders/attendees";
import { payPath, rotatePayToken } from "@/lib/orders/charges";
import { prisma } from "@/lib/prisma";
import { consume } from "@/lib/rate-limit";
import { ticketPdfPath } from "@/lib/tickets/download";
import { localMidnight, sendResellerReport } from "./report";
import { sellAtPos, type PosMethod } from "./sale";
import type { AgentInviteState, PosPayLinkState, PosSaleState } from "./types";

/**
 * Points de vente : réglages par l'admin (tous) ou l'organisateur (les
 * siens), et vente au guichet par leurs agents.
 */

const MAX_NOTIFY = 10;
const INVITATION_DAYS = 7;

async function managed(resellerId: string) {
  const { user, organizerId } = await catalogActor();
  const reseller = await prisma.reseller.findFirst({
    where: { id: resellerId, ...(organizerId ? { organizerId } : {}) },
    select: { id: true, name: true, organizerId: true },
  });
  return reseller ? { user, organizerId, reseller } : null;
}

function readEmails(raw: string): string[] | null {
  const list = [...new Set(raw.split(/[\s,;]+/).map((a) => a.trim().toLowerCase()).filter(Boolean))];
  if (list.length > MAX_NOTIFY) return null;
  return list.every((a) => z.email().max(200).safeParse(a).success) ? list : null;
}

/** « 2,5 » → 250 points de base. */
function readPercentBps(formData: FormData, name: string): number | null {
  const raw = readText(formData, name).replace(",", ".");
  if (raw === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return null;
  const bps = Math.round(Number(raw) * 100);
  return bps <= 10_000 ? bps : null;
}

function readCommission(formData: FormData, prefix: string) {
  const kind = readText(formData, `${prefix}Kind`);
  if (kind !== "PERCENT" && kind !== "FIXED_PER_TICKET") return null;
  const bps = kind === "PERCENT" ? readPercentBps(formData, `${prefix}Percent`) : 0;
  const fixed =
    kind === "FIXED_PER_TICKET"
      ? readText(formData, `${prefix}Fixed`) === ""
        ? 0
        : readMoneyCents(formData, `${prefix}Fixed`)
      : 0;
  if (bps == null || fixed == null || fixed > 1_000_00) return null;
  return { kind, bps, fixedCents: fixed } as const;
}

const resellerSchema = z.object({
  name: z.string().min(1).max(120),
  type: z.enum(["TOURISM_OFFICE", "PARTNER_SHOP", "BOX_OFFICE"]),
  email: z.email().max(200),
  phone: z.string().max(40),
  address: z.string().max(200),
  city: z.string().max(100),
  locale: z.enum(["fr", "en", "de", "it"]),
  reportFrequency: z.enum(["NONE", "DAILY", "WEEKLY"]),
});

export async function saveReseller(_prev: FormState, formData: FormData): Promise<FormState> {
  const { organizerId } = await catalogActor();
  const id = readText(formData, "id");
  const parsed = resellerSchema.safeParse({
    name: readText(formData, "name"),
    type: readText(formData, "type") || "TOURISM_OFFICE",
    email: readText(formData, "email").toLowerCase(),
    phone: readText(formData, "phone"),
    address: readText(formData, "address"),
    city: readText(formData, "city"),
    locale: readText(formData, "locale") || "fr",
    reportFrequency: readText(formData, "reportFrequency") || "NONE",
  });
  if (!parsed.success) return failure("invalid");
  const commission = readCommission(formData, "commission");
  if (!commission) return failure("commission");
  const notifyEmails = readEmails(readText(formData, "notifyEmails"));
  if (!notifyEmails) return failure("notifyEmails");
  const allowCashSales = readBoolean(formData, "allowCashSales");
  const allowTerminalSales = readBoolean(formData, "allowTerminalSales");
  const allowOnlineSales = readBoolean(formData, "allowOnlineSales");
  if (!allowCashSales && !allowTerminalSales && !allowOnlineSales) return failure("methods");

  // L'organisateur gère les siens ; l'admin peut le rattacher à un
  // organisateur, ou le laisser vendre pour plusieurs.
  let owner: string | null = organizerId;
  if (!organizerId) {
    const requested = readText(formData, "organizerId");
    if (requested) {
      const exists = await prisma.organizer.count({ where: { id: requested } });
      if (!exists) return failure("invalid");
      owner = requested;
    }
  }

  const data = {
    ...parsed.data,
    phone: parsed.data.phone || null,
    address: parsed.data.address || null,
    city: parsed.data.city || null,
    commissionKind: commission.kind,
    commissionBps: commission.bps,
    commissionFixedCents: commission.fixedCents,
    allowCashSales,
    allowTerminalSales,
    allowOnlineSales,
    notifyEmails,
    reportCopyOrganizer: readBoolean(formData, "reportCopyOrganizer"),
  };

  if (id) {
    const actor = await managed(id);
    if (!actor) return failure("notFound");
    const before = await prisma.reseller.findUniqueOrThrow({
      where: { id },
      select: { reportFrequency: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.reseller.update({
        where: { id },
        data: {
          ...data,
          organizerId: owner,
          active: readBoolean(formData, "active"),
          // Nouvelle fréquence : le premier récapitulatif couvre la période à venir.
          ...(before.reportFrequency !== data.reportFrequency ? { lastReportAt: new Date() } : {}),
        },
      });
      if (owner) {
        await tx.resellerEvent.deleteMany({
          where: { resellerId: id, event: { organizerId: { not: owner } } },
        });
      }
    });
    revalidatePath("/admin/resellers");
    revalidatePath(`/admin/resellers/${id}`);
    revalidatePath("/pos");
    return success(id);
  }

  const base = slugify(parsed.data.name) || "point-de-vente";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    const taken = await prisma.reseller.count({ where: { slug } });
    if (taken) continue;
    const created = await prisma.reseller.create({
      data: { ...data, slug, organizerId: owner, lastReportAt: new Date() },
      select: { id: true },
    });
    revalidatePath("/admin/resellers");
    return success(created.id);
  }
  return failure("retry");
}

/** Spectacle ouvert à la vente du point de vente. */
export async function assignResellerEvent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await managed(readText(formData, "resellerId"));
  if (!actor) return failure("notFound");
  const eventId = readText(formData, "eventId");
  const owner = actor.reseller.organizerId ?? actor.organizerId;
  const event = await prisma.event.findFirst({
    where: { id: eventId, ...(owner ? { organizerId: owner } : {}) },
    select: { id: true },
  });
  if (!event) return failure("notFound");
  await prisma.resellerEvent.upsert({
    where: { resellerId_eventId: { resellerId: actor.reseller.id, eventId: event.id } },
    create: { resellerId: actor.reseller.id, eventId: event.id },
    update: {},
  });
  revalidatePath(`/admin/resellers/${actor.reseller.id}`);
  revalidatePath("/pos");
  return success(event.id);
}

export async function unassignResellerEvent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await managed(readText(formData, "resellerId"));
  if (!actor) return failure("notFound");
  await prisma.resellerEvent.deleteMany({
    where: {
      resellerId: actor.reseller.id,
      eventId: readText(formData, "eventId"),
      ...(actor.organizerId ? { event: { organizerId: actor.organizerId } } : {}),
    },
  });
  revalidatePath(`/admin/resellers/${actor.reseller.id}`);
  revalidatePath("/pos");
  return success();
}

/** Commission propre au spectacle ; « inherit » revient à celle du point de vente. */
export async function saveResellerEventCommission(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await managed(readText(formData, "resellerId"));
  if (!actor) return failure("notFound");
  const eventId = readText(formData, "eventId");
  const inherit = readText(formData, "overrideKind") === "INHERIT";
  const commission = inherit ? null : readCommission(formData, "override");
  if (!inherit && !commission) return failure("commission");
  const { count } = await prisma.resellerEvent.updateMany({
    where: {
      resellerId: actor.reseller.id,
      eventId,
      ...(actor.organizerId ? { event: { organizerId: actor.organizerId } } : {}),
    },
    data: {
      commissionKind: commission?.kind ?? null,
      commissionBps: commission ? commission.bps : null,
      commissionFixedCents: commission ? commission.fixedCents : null,
    },
  });
  if (count !== 1) return failure("notFound");
  revalidatePath(`/admin/resellers/${actor.reseller.id}`);
  revalidatePath("/pos");
  return success(eventId);
}

const inviteSchema = z.object({
  email: z.email().max(200),
  name: z.string().max(120),
  locale: z.enum(["fr", "en", "de", "it"]),
});

/** Vendeur du point de vente : compte invité à choisir son mot de passe. */
export async function inviteResellerAgent(
  _prev: AgentInviteState,
  formData: FormData,
): Promise<AgentInviteState> {
  const actor = await managed(readText(formData, "resellerId"));
  if (!actor) return { ok: false, error: "forbidden" };
  const parsed = inviteSchema.safeParse({
    email: readText(formData, "email").toLowerCase(),
    name: readText(formData, "name"),
    locale: readText(formData, "locale") || "fr",
  });
  if (!parsed.success) return { ok: false, error: "invalid" };
  if (!consume(`invite:${actor.user.id}`, 20, 60 * 60_000)) {
    return { ok: false, error: "throttled" };
  }

  const { email, name, locale } = parsed.data;
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, resellerId: true, name: true, locale: true },
  });
  // Seul un compte client devient vendeur : il garde ses billets. Les autres
  // rôles perdraient leurs droits sans le savoir.
  if (
    existing &&
    existing.role !== "CUSTOMER" &&
    !(existing.role === "RESELLER_AGENT" && existing.resellerId === actor.reseller.id)
  ) {
    return { ok: false, error: "otherRole" };
  }

  try {
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: "RESELLER_AGENT",
            resellerId: actor.reseller.id,
            name: existing.name ?? (name || null),
          },
          select: { id: true, name: true },
        })
      : await prisma.user.create({
          data: {
            email,
            name: name || null,
            locale,
            role: "RESELLER_AGENT",
            resellerId: actor.reseller.id,
          },
          select: { id: true, name: true },
        });
    const token = randomBytes(32).toString("base64url");
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + INVITATION_DAYS * 24 * 3600_000),
      },
    });
    const lang = existing?.locale ?? locale;
    await sendResellerAgentInvitationEmail({
      to: email,
      name: user.name,
      locale: lang,
      resellerName: actor.reseller.name,
      url: `${publicAppOrigin()}/${lang}/reset-password?token=${token}`,
      expiresInDays: INVITATION_DAYS,
    });
  } catch (error) {
    console.error("[points de vente] invitation impossible", error);
    return { ok: false, error: "unavailable" };
  }

  revalidatePath(`/admin/resellers/${actor.reseller.id}`);
  return { ok: true, email };
}

export async function revokeResellerAgent(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await managed(readText(formData, "resellerId"));
  if (!actor) return failure("forbidden");
  const userId = readText(formData, "userId");
  const { count } = await prisma.user.updateMany({
    where: { id: userId, role: "RESELLER_AGENT", resellerId: actor.reseller.id },
    data: { role: "CUSTOMER", resellerId: null },
  });
  if (count !== 1) return failure("forbidden");
  await destroyAllSessions(userId);
  revalidatePath(`/admin/resellers/${actor.reseller.id}`);
  return success();
}

/** Récapitulatif envoyé tout de suite : aujourd'hui, ou les 7 derniers jours. */
export async function sendResellerReportNow(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await managed(readText(formData, "resellerId"));
  if (!actor) return failure("notFound");
  if (!consume(`pos-report:${actor.reseller.id}`, 5, 60 * 60_000)) return failure("throttled");
  const now = new Date();
  const span = readText(formData, "span") === "day" ? 0 : -6;
  const { sent } = await sendResellerReport(actor.reseller.id, {
    from: localMidnight(now, span),
    to: now,
  });
  return sent > 0 ? success(String(sent)) : failure("notSent");
}

// ─────────────────────────────── Vente au guichet

const saleSchema = z.object({
  sessionId: z.string().min(1),
  method: z.enum(["CASH", "TERMINAL", "ONLINE"]),
  holderName: z.string().max(120),
  email: z.union([z.literal(""), z.email().max(200)]),
  phone: z.string().max(40),
  locale: z.enum(locales),
});

async function qrFor(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 320 });
}

export async function sellAtPosAction(
  _prev: PosSaleState,
  formData: FormData,
): Promise<PosSaleState> {
  const agent = await requireResellerAgent();
  const parsed = saleSchema.safeParse({
    sessionId: readText(formData, "sessionId"),
    method: readText(formData, "method"),
    holderName: readText(formData, "holderName"),
    email: readText(formData, "email").toLowerCase(),
    phone: readText(formData, "phone"),
    locale: readText(formData, "locale"),
  });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const data = parsed.data;

  const lines: { ticketTypeId: string; quantity: number }[] = [];
  const attendees: AttendeeInput[] = [];
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const qty = /^qty\.(.+)$/.exec(key);
    if (qty) {
      const quantity = Number(value || "0");
      if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100) {
        return { ok: false, error: "quantity" };
      }
      if (quantity > 0) lines.push({ ticketTypeId: qty[1]!, quantity });
      continue;
    }
    const holder = /^attendee\.([^.]+)\.(\d+)\.name$/.exec(key);
    if (holder) {
      attendees.push({
        ticketTypeId: holder[1]!,
        name: value,
        birthDate: readText(formData, `attendee.${holder[1]}.${holder[2]}.birthDate`),
      });
    }
  }

  const result = await sellAtPos({
    agentId: agent.id,
    resellerId: agent.resellerId,
    sessionId: data.sessionId,
    lines,
    method: data.method as PosMethod,
    holderName: data.holderName,
    email: data.email,
    phone: data.phone,
    locale: data.locale,
    attendees,
  });
  if (!result.ok) return { ok: false, error: result.error, ticketTypeId: result.ticketTypeId };

  revalidatePath("/pos");
  if (result.token && result.chargeId) {
    const payUrl = payUrlFor(payPath(result.token, data.locale));
    const emailed = data.email
      ? (await sendPaymentLinkEmail(result.chargeId, payUrl)).sent
      : false;
    return {
      ok: true,
      orderId: result.orderId,
      reference: result.reference,
      payUrl,
      payQr: await qrFor(payUrl),
      emailed,
    };
  }
  const mail = await sendPaidOrderTickets(result.orderId);
  return {
    ok: true,
    orderId: result.orderId,
    reference: result.reference,
    pdfUrl: ticketPdfPath(result.reference),
    emailed: Boolean(data.email) && mail.sent,
  };
}

/** Nouveau QR pour un paiement en ligne en attente ; l'ancien lien ne marche plus. */
export async function posNewPayLink(
  _prev: PosPayLinkState,
  formData: FormData,
): Promise<PosPayLinkState> {
  const agent = await requireResellerAgent();
  const charge = await prisma.orderCharge.findFirst({
    where: {
      orderId: readText(formData, "orderId"),
      method: "LINK",
      status: "OPEN",
      order: { resellerId: agent.resellerId },
    },
    select: { id: true, order: { select: { locale: true } } },
  });
  if (!charge) return { ok: false, error: "notFound" };
  const token = await rotatePayToken(charge.id);
  if (!token) return { ok: false, error: "notFound" };
  const payUrl = payUrlFor(payPath(token, charge.order.locale));
  return { ok: true, payUrl, payQr: await qrFor(payUrl) };
}
