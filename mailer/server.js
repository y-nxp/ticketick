// Service d'envoi du formulaire de contact de la page d'attente.
//
// Volontairement minimal : seul nodemailer est nécessaire, le serveur HTTP
// vient de la bibliothèque standard. Il n'est pas exposé sur Internet — nginx
// lui transmet uniquement /api/contact.

import { createServer } from "node:http";
import nodemailer from "nodemailer";

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 8 * 1024;

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER;
const MAIL_TO = process.env.MAIL_TO;

for (const [name, value] of Object.entries({
  SMTP_HOST,
  SMTP_USER,
  SMTP_PASSWORD,
  MAIL_TO,
})) {
  if (!value) {
    console.error(`✖ Variable ${name} manquante.`);
    process.exit(1);
  }
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  // 465 impose TLS d'emblée ; les autres ports passent par STARTTLS.
  secure: SMTP_PORT === 465,
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
});

/**
 * Limitation par adresse IP. Un formulaire public sans garde-fou est
 * rapidement exploité pour du spam. Fenêtre glissante en mémoire : suffisant
 * pour une page d'attente, et remis à zéro au redémarrage.
 *
 * Seuls les messages acceptés sont comptés : sinon une personne qui se trompe
 * cinq fois de saisie se retrouverait bloquée une heure.
 */
const RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };
const hits = new Map();

function recentHits(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT.windowMs,
  );
  hits.set(ip, recent);
  return recent;
}

function isRateLimited(ip) {
  return recentHits(ip).length >= RATE_LIMIT.max;
}

function recordHit(ip) {
  recentHits(ip).push(Date.now());
}

// Purge périodique pour que la table ne grossisse pas indéfiniment.
setInterval(
  () => {
    const now = Date.now();
    for (const [ip, times] of hits) {
      const recent = times.filter((t) => now - t < RATE_LIMIT.windowMs);
      if (recent.length) hits.set(ip, recent);
      else hits.delete(ip);
    }
  },
  10 * 60 * 1000,
).unref();

/** Neutralise les retours à la ligne : évite l'injection d'en-têtes SMTP. */
function singleLine(value, max = 200) {
  return String(value).replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("payload_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return json(res, 200, { status: "ok" });
  }

  if (req.method !== "POST" || !req.url?.startsWith("/api/contact")) {
    return json(res, 404, { error: "not_found" });
  }

  // nginx transmet l'IP réelle ; on retombe sur la socket en son absence.
  const ip =
    singleLine(req.headers["x-real-ip"] || "", 45) ||
    singleLine((req.headers["x-forwarded-for"] || "").split(",")[0], 45) ||
    req.socket.remoteAddress ||
    "unknown";

  if (isRateLimited(ip)) {
    return json(res, 429, { error: "rate_limited" });
  }

  let data;
  try {
    data = JSON.parse(await readBody(req));
  } catch {
    return json(res, 400, { error: "invalid_body" });
  }

  // Champ leurre, invisible pour l'utilisateur : seuls les robots le remplissent.
  // On répond succès pour ne pas leur signaler la détection.
  if (data.website) {
    console.warn(`↯ Leurre déclenché (${ip}) — message ignoré.`);
    recordHit(ip);
    return json(res, 200, { ok: true });
  }

  const name = singleLine(data.name || "", 120);
  const email = singleLine(data.email || "", 200);
  const subject = singleLine(data.subject || "", 160);
  const message = String(data.message || "").trim().slice(0, 5000);

  if (!name || !isEmail(email) || message.length < 10) {
    return json(res, 422, { error: "invalid_fields" });
  }

  try {
    await transporter.sendMail({
      from: { name: "ticketick.ch", address: MAIL_FROM },
      to: MAIL_TO,
      // L'adresse saisie n'est pas l'expéditeur (SPF/DKIM), mais permet
      // de répondre directement depuis la boîte.
      replyTo: { name, address: email },
      subject: subject
        ? `[ticketick.ch] ${subject}`
        : `[ticketick.ch] Message de ${name}`,
      text: [
        `Nom     : ${name}`,
        `E-mail  : ${email}`,
        subject ? `Objet   : ${subject}` : null,
        "",
        message,
        "",
        "—",
        `Envoyé depuis le formulaire de ticketick.ch (IP ${ip})`,
      ]
        .filter((line) => line !== null)
        .join("\n"),
    });

    console.log(`✉ Message transmis (${email})`);
    recordHit(ip);
    return json(res, 200, { ok: true });
  } catch (error) {
    console.error("✖ Envoi impossible :", error.message);
    return json(res, 502, { error: "send_failed" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`▶ Service de contact en écoute sur :${PORT}`);
  console.log(`  SMTP ${SMTP_HOST}:${SMTP_PORT} → ${MAIL_TO}`);
});
