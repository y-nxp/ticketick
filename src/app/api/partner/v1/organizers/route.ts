import { listOrganizers } from "@/lib/partner/data";
import { partnerRoute } from "@/lib/partner/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = partnerRoute(async () => ({ organizers: await listOrganizers() }));
