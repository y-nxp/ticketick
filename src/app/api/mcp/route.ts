import { preflight } from "@/lib/api/http";
import { handleMcp } from "@/lib/api/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handleMcp;
export const GET = handleMcp;
export const DELETE = handleMcp;
export const OPTIONS = preflight;
