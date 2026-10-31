import { searchEvents } from "@/lib/partner/data";
import { partnerRoute } from "@/lib/partner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = partnerRoute(({ organizerId, locale, url }) =>
  searchEvents({
    organizerId,
    locale,
    text: url.searchParams.get("q")?.slice(0, 120) ?? null,
    date: url.searchParams.get("date"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  }),
);
