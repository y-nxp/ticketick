import "server-only";

import type { CurrentUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { doorEventWhere } from "./scope";

/**
 * La caisse de l'app de contrôle n'apparaît que pour les organisateurs qui
 * l'ont activée (encaissement par Collect for Stripe sur un WisePad) et dont
 * le compte Stripe est branché : sans lui, ticketick ne peut pas vérifier
 * les paiements.
 */
export async function doorTillEnabled(user: CurrentUser): Promise<boolean> {
  const scope = doorEventWhere(user);
  const organizerId =
    user.role === "DOOR_STAFF" ? user.doorOrganizerId : user.role === "ORGANIZER" ? user.organizerId : null;
  if (user.role !== "ADMIN" && !organizerId) return false;
  const n = await prisma.organizer.count({
    where: {
      ...(organizerId ? { id: organizerId } : {}),
      doorTill: "collect",
      stripe: { enabled: true },
      // Garde-fou : le périmètre du contrôle s'applique aussi à la caisse.
      events: { some: scope },
    },
  });
  return n > 0;
}
