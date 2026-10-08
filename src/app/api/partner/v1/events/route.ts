import { searchEvents } from "@/lib/partner/data";
import { partnerRoute } from "@/lib/partner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = partnerRoute(async ({ organizerId, locale, url }) => ({
  events: await searchEvents({
    organizerId,
    locale,
    text: url.searchParams.get("q")?.slice(0, 120) ?? null,
    date: url.searchParams.get("date"),
  }),
}));
