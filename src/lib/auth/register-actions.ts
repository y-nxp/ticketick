"use server";

import bcrypt from "bcryptjs";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import * as z from "zod";
import { redirect } from "@/i18n/navigation";
import { prisma } from "@/lib/prisma";
import { clientIpFrom } from "@/lib/rate-limit";
import { sendVerificationLink } from "./email-verification";
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

    // Les achats faits sans compte sous cette adresse ne sont rattachés qu'une
    // fois l'adresse confirmée : sans cela, s'inscrire avec l'e-mail d'un
    // acheteur suffirait à récupérer ses billets.
    await sendVerificationLink(user.id).catch((error) => {
      console.error("[auth] envoi du lien de confirmation", error);
    });

    await createSession(user.id);
  } catch (error) {
    console.error("[auth] inscription impossible", error);
    return { error: "unavailable" };
  }

  return redirect({ href: safeNext(formData.get("next"), "/account"), locale });
}

function safeNext(value: FormDataEntryValue | null, fallback: string): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || /^\/[/\\]/.test(value)) return fallback;
  return value;
}

async function clientIp(): Promise<string> {
  return clientIpFrom(await headers());
}
