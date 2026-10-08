import { z } from "zod";
import { lookupOrder } from "@/lib/partner/data";
import { badRequest, partnerRoute } from "@/lib/partner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  reference: z.string().trim().min(4).max(40),
  email: z.string().trim().max(200).email(),
});

export const POST = partnerRoute(async ({ organizerId, locale, body }) => {
  const input = schema.safeParse(body);
  if (!input.success) return badRequest();
  const order = await lookupOrder({ ...input.data, organizerId, locale });
  return order ? { found: true, order } : { found: false };
});
