import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { NextResponse } from "next/server";
import { safeUploadRelative, uploadRoot } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const url = `/uploads/${path.join("/")}`;
  const relative = safeUploadRelative(url);
  if (!relative) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const bytes = await readFile(join(uploadRoot(), relative));
    return new NextResponse(bytes, {
      headers: {
        "content-type": TYPES[extname(relative).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
