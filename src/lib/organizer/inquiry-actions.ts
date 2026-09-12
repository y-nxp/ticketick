"use server";

import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import type { InquiryFormat } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendOrganizerInquiryEmail } from "@/lib/email";

/**
 * Candidature organisateur.
 *
 * Personne ne s'ouvre un espace tout seul : on enregistre la demande, on
 * prévient l'administrateur, et c'est lui qui propose le rendez-vous puis
 * ouvre les accès. La page publique ne doit jamais laisser croire le contraire.
 */

export type InquiryState = { ok: true } | { error: string } | undefined;

const FORMATS = ["ONE_DAY", "MULTI_DAY", "MULTI_SESSION", "UNSURE"] as const;

const tentatives = new Map<string, { n: number; jusqu: number }>();

function trop(cle: string, max: number): boolean {
  const maintenant = Date.now();
  const suivi = tentatives.get(cle);
  if (!suivi || suivi.jusqu < maintenant) return false;
  return suivi.n >= max;
}

function compter(cle: string, fenetreMs: number) {
  const maintenant = Date.now();
  const suivi = tentatives.get(cle);
  if (!suivi || suivi.jusqu < maintenant) {
    tentatives.set(cle, { n: 1, jusqu: maintenant + fenetreMs });
    return;
  }
  suivi.n += 1;
}

function lire(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function telephoneValide(brut: string): boolean {
  const chiffres = brut.replace(/\D/g, "");
  return chiffres.length >= 8 && chiffres.length <= 15;
}

export async function submitOrganizerInquiry(
  _state: InquiryState,
  data: FormData,
): Promise<InquiryState> {
  const email = lire(data, "email").toLowerCase();
  const phone = lire(data, "phone");
  const formatRaw = lire(data, "format");
  const message = lire(data, "message");

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "invalidEmail" };
  }
  if (!telephoneValide(phone)) return { error: "invalidPhone" };

  const format = (
    FORMATS as readonly string[]
  ).includes(formatRaw)
    ? (formatRaw as InquiryFormat)
    : null;
  if (!format) return { error: "invalidFormat" };

  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "inconnue";
  const fenetre = 15 * 60 * 1000;
  const cles = [`inq-ip:${ip}`, `inq-mail:${email}`];
  if (cles.some((c) => trop(c, 5))) return { error: "throttled" };
  cles.forEach((c) => compter(c, fenetre));

  const locale = await getLocale();

  try {
    await prisma.organizerInquiry.create({
      data: {
        email,
        phone,
        format,
        message: message || null,
        locale,
      },
    });

    // L'échec d'envoi ne doit pas faire croire que la demande est perdue :
    // elle est déjà en base, visible dans le backoffice.
    await sendOrganizerInquiryEmail({
      email,
      phone,
      format,
      message: message || null,
      locale,
    });

    return { ok: true };
  } catch (error) {
    console.error("[organizer] candidature impossible", error);
    return { error: "unavailable" };
  }
}
