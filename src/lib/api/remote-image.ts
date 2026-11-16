import "server-only";

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { ApiError } from "./errors";

/**
 * Image de couverture donnée par URL : téléchargée par le serveur, donc
 * jamais vers une adresse interne (Docker, réseau local, métadonnées).
 */

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

function isPublicAddress(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return !blocked.check(mapped[1], "ipv4");
  const family = isIP(address);
  if (family === 0) return false;
  return !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

const unavailable = (why: string) =>
  new ApiError(422, "cover_image_unavailable", `coverImageUrl could not be used: ${why}.`);

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:") throw unavailable("only https URLs are accepted");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw unavailable("host not found");
  if (!addresses.every((a) => isPublicAddress(a.address))) {
    throw unavailable("host is not a public address");
  }
}

/** Télécharge l'image ; `File` prêt pour `saveUploadedImage`. */
export async function downloadCoverImage(raw: string): Promise<File> {
  let url = new URL(raw);
  let response: Response | null = null;
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicHost(url);
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "image/webp,image/png,image/jpeg", "user-agent": "ticketick-api/1.0" },
    }).catch(() => null);
    if (!response) throw unavailable("download failed");
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      url = new URL(location, url);
      continue;
    }
    break;
  }
  if (!response || !response.ok) throw unavailable(`HTTP ${response?.status ?? "error"}`);

  const type = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!TYPES.has(type)) throw unavailable("JPEG, PNG or WebP expected");
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    throw unavailable("larger than 4 MB");
  }

  const reader = response.body?.getReader();
  if (!reader) throw unavailable("empty response");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw unavailable("larger than 4 MB");
    }
    chunks.push(value);
  }
  if (size === 0) throw unavailable("empty image");
  return new File(chunks as BlobPart[], "cover", { type });
}
