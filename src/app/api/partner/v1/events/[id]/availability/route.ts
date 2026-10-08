import { eventAvailability } from "@/lib/partner/data";
import { notFound, partnerRoute } from "@/lib/partner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = partnerRoute(async ({ organizerId, locale, url }) => {
  const id = url.pathname.split("/").at(-2) ?? "";
  return (await eventAvailability(id, organizerId, locale)) ?? notFound();
});
