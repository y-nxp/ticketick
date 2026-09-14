"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import * as z from "zod";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { createSession } from "./session";

const RegisterSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    email: z.email().trim().toLowerCase(),
    password: z.string().min(12).max(200),
    confirm: z.string().min(1),
    marketingOptIn: z.boolean(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

export interface RegisterState {
  error?:
    | "invalid"
    | "tooShort"
    | "mismatch"
    | "emailTaken"
    | "throttled"
    | "unavailable";
}

const ATTEMPTS = { max: 8, windowMs: 15 * 60 * 1000 };
const attempts = new Map<string, number[]>();

function tooMany(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter(
    (t) => now - t < ATTEMPTS.windowMs,
  );
  attempts.set(ip, recent);
  return recent.length >= ATTEMPTS.max;
}

function record(ip: string): void {
  attempts.set(ip, [...(attempts.get(ip) ?? []), Date.now()]);
}

export async function register(
  _state: RegisterState | undefined,
  formData: FormData,
): Promise<RegisterState> {
  const locale = await getLocale();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 12) return { error: "tooShort" };
  if (password !== confirm) return { error: "mismatch" };

  const parsed = RegisterSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    password,
    confirm,
    marketingOptIn: formData.get("marketingOptIn") === "on",
  });
  if (!parsed.success) return { error: "invalid" };

  const ip = await clientIp();
  if (tooMany(ip)) return { error: "throttled" };

  const { firstName, lastName, email, marketingOptIn } = parsed.data;
  const name = `${firstName} ${lastName}`.trim();

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      record(ip);
      return { error: "emailTaken" };
    }

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(parsed.data.password, 12),
        role: "CUSTOMER",
        locale,
        marketingOptIn,
        marketingOptInAt: marketingOptIn ? new Date() : null,
      },
      select: { id: true },
    });

    await attachOrdersToUser(user.id, email);
    if (marketingOptIn) {
      await followOrganizersFromOrders(user.id);
    }

    await createSession(user.id);
  } catch (error) {
    console.error("[auth] inscription impossible", error);
    return { error: "unavailable" };
  }

  return redirect({ href: safeNext(formData.get("next"), "/account"), locale });
}

/** Les achats faits sans compte se retrouvent dans l'espace dès l'inscription. */
export async function attachOrdersToUser(
  userId: string,
  email: string,
): Promise<void> {
  await prisma.order.updateMany({
    where: { email, userId: null },
    data: { userId },
  });
}

export async function followOrganizersFromOrders(userId: string): Promise<void> {
  const orders = await prisma.order.findMany({
    where: { userId, status: "PAID" },
    select: {
      items: {
        select: {
          ticketType: {
            select: { session: { select: { event: { select: { organizerId: true } } } } },
          },
        },
      },
    },
  });

  const ids = new Set<string>();
  for (const order of orders) {
    for (const item of order.items) {
      ids.add(item.ticketType.session.event.organizerId);
    }
  }

  for (const organizerId of ids) {
    await prisma.organizerFollow.upsert({
      where: { userId_organizerId: { userId, organizerId } },
      create: { userId, organizerId },
      update: {},
    });
  }
}

function safeNext(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || /^\/[/\\]/.test(value)) return fallback;
  return value;
}

async function clientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "inconnue";
  return headerList.get("x-real-ip") ?? "inconnue";
}
