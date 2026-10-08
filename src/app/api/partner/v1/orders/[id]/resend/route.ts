import { z } from "zod";
import { resendOrderTickets } from "@/lib/partner/data";
import { badRequest, partnerRoute } from "@/lib/partner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ email: z.string().trim().max(200).email() });

export const POST = partnerRoute(async ({ organizerId, body, url }) => {
  const input = schema.safeParse(body);
  if (!input.success) return badRequest();
  const orderId = url.pathname.split("/").at(-2) ?? "";
  return resendOrderTickets({ orderId, email: input.data.email, organizerId });
});
