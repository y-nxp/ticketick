import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { freezePromotionImage, ImageCopyError, imageMime, type ImageStore } from "./image-copy";

/**
 * Le stockage réel (`src/lib/uploads.ts`) est `server-only` et ne se charge
 * pas hors de Next.js : ce double écrit de la même façon dans un dossier
 * temporaire, qui joue le rôle de `UPLOAD_DIR`.
 */
let root = "";
const store: ImageStore = {
  async read(url) {
    try {
      return await readFile(join(root, url.replace(/^\/uploads\//, "")));
    } catch {
      return null;
    }
  },
  async save(file, folder) {
    const name = `${Date.now()}-${randomBytes(4).toString("hex")}.${file.type.split("/")[1]}`;
    await mkdir(join(root, folder), { recursive: true });
    await writeFile(join(root, folder, name), Buffer.from(await file.arrayBuffer()));
    return `/uploads/${folder}/${name}`;
  },
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 8, 7]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

async function put(url: string, bytes: Buffer) {
  const path = join(root, url.replace(/^\/uploads\//, ""));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), "tt-promotion-"));
});
after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("copie figée : changer l'affiche ensuite ne change pas la copie", async () => {
  const event = { coverImage: "/uploads/events/affiche.png" };
  await put(event.coverImage, PNG);

  const copy = await freezePromotionImage(store, event.coverImage, "org-a");
  assert.match(copy, /^\/uploads\/promotion\/org-a\/[\w-]+\.png$/);
  assert.notEqual(copy, event.coverImage);

  // L'organisateur remplace le fichier de l'affiche, puis en dépose une autre.
  await put(event.coverImage, JPEG);
  event.coverImage = "/uploads/events/nouvelle.jpg";
  await put(event.coverImage, JPEG);

  assert.deepEqual(await store.read(copy), PNG);
});

test("type relevé d'après le contenu, pas d'après l'extension", async () => {
  assert.equal(imageMime(PNG), "image/png");
  assert.equal(imageMime(JPEG), "image/jpeg");
  assert.equal(imageMime(WEBP), "image/webp");
  assert.equal(imageMime(Buffer.from("<svg/>")), null);

  await put("/uploads/events/deguise.png", JPEG);
  assert.match(await freezePromotionImage(store, "/uploads/events/deguise.png", "org-a"), /\.jpeg$/);
});

test("refus : adresse externe, fichier absent ou qui n'est pas une image", async () => {
  const key = async (source: string) => {
    try {
      await freezePromotionImage(store, source, "org-a");
      return "accepté";
    } catch (error) {
      assert.ok(error instanceof ImageCopyError);
      return error.key;
    }
  };
  assert.equal(await key("https://images.example.com/affiche.jpg"), "imageExternal");
  assert.equal(await key("/images/affiche.jpg"), "imageExternal");
  assert.equal(await key("/uploads/events/absente.png"), "imageMissing");
  await put("/uploads/events/texte.png", Buffer.from("pas une image"));
  assert.equal(await key("/uploads/events/texte.png"), "imageUnsupported");
});
