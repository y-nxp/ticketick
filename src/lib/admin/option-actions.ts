"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type EventOptionPriceMode } from "@prisma/client";
import { catalogActor, forbidIfForeignEvent } from "@/lib/admin/access";
import { prisma } from "@/lib/prisma";
import {
  failure,
  readBoolean,
  readInteger,
  readMoneyCents,
  readOptionalText,
  readText,
  readTranslated,
  success,
  type FormState,
} from "./form";

function refresh(eventId: string) {
  revalidatePath(`/admin/events/${eventId}`);
}

export async function saveEventOption(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();
  const eventId = readText(data, "eventId");
  if (!eventId) return failure("notFound");
  await forbidIfForeignEvent(eventId, scoped);

  const id = readOptionalText(data, "id");
  const title = readTranslated(data, "title");
  if (!title.fr) return failure("titleRequired");

  const hint = readTranslated(data, "hint");
  const sessionId = readOptionalText(data, "sessionId") ?? null;
  const enabled = readBoolean(data, "enabled");
  const priceMode = readText(data, "priceMode");
  if (priceMode !== "FLAT" && priceMode !== "PER_CHOICE") {
    return failure("priceModeInvalid");
  }

  const priceRaw = readText(data, "price");
  const priceCents =
    priceRaw === "" ? 0 : readMoneyCents(data, "price");
  if (priceCents == null || priceCents < 0) return failure("priceInvalid");

  const sortOrder = readInteger(data, "sortOrder") ?? 0;
  const groups = readGroups(data);
  if (!groups.ok) return failure(groups.error);

  if (sessionId) {
    const session = await prisma.eventSession.findFirst({
      where: { id: sessionId, eventId },
      select: { id: true },
    });
    if (!session) return failure("notFound");
  }

  const payload = {
    eventId,
    sessionId,
    enabled,
    title,
    hint: hint.fr ? hint : Prisma.JsonNull,
    priceCents,
    priceMode: priceMode as EventOptionPriceMode,
    sortOrder,
  };

  try {
    await prisma.$transaction(async (tx) => {
      const option = id
        ? await tx.eventOption.update({
            where: { id },
            data: { ...payload, groups: { deleteMany: {} } },
            select: { id: true, eventId: true },
          })
        : await tx.eventOption.create({
            data: payload,
            select: { id: true, eventId: true },
          });
      if (option.eventId !== eventId) throw new Error("foreign");

      for (const [index, group] of groups.rows.entries()) {
        await tx.eventOptionGroup.create({
          data: {
            optionId: option.id,
            title: group.title,
            required: group.required,
            sortOrder: index,
            choices: {
              create: group.choices.map((choice, choiceIndex) => ({
                label: choice,
                sortOrder: choiceIndex,
              })),
            },
          },
        });
      }
    });
  } catch {
    return failure("unavailable");
  }

  refresh(eventId);
  return success();
}

export async function deleteEventOption(
  _state: FormState,
  data: FormData,
): Promise<FormState> {
  const { organizerId: scoped } = await catalogActor();
  const id = readText(data, "id");
  const eventId = readText(data, "eventId");
  if (!id || !eventId) return failure("notFound");
  await forbidIfForeignEvent(eventId, scoped);

  const used = await prisma.orderOption.count({ where: { optionId: id } });
  if (used > 0) return failure("optionHasOrders");

  try {
    await prisma.eventOption.delete({ where: { id } });
  } catch {
    return failure("unavailable");
  }

  refresh(eventId);
  return success();
}

function readGroups(data: FormData):
  | { ok: true; rows: { title: Record<string, string>; required: boolean; choices: Record<string, string>[] }[] }
  | { ok: false; error: string } {
  const count = Number(readText(data, "groupCount") || "0");
  if (!Number.isInteger(count) || count < 0 || count > 12) {
    return { ok: false, error: "optionGroupInvalid" };
  }
  const rows = [];
  for (let i = 0; i < count; i++) {
    const title = readTranslated(data, `group.${i}.title`);
    if (!title.fr) return { ok: false, error: "titleRequired" };
    const required = readBoolean(data, `group.${i}.required`);
    const choiceCount = Number(readText(data, `group.${i}.choiceCount`) || "0");
    if (!Number.isInteger(choiceCount) || choiceCount < 0 || choiceCount > 20) {
      return { ok: false, error: "optionGroupInvalid" };
    }
    const choices = [];
    for (let j = 0; j < choiceCount; j++) {
      const label = readTranslated(data, `group.${i}.choice.${j}.label`);
      if (!label.fr) return { ok: false, error: "titleRequired" };
      choices.push(label);
    }
    rows.push({ title, required, choices });
  }
  return { ok: true, rows };
}
