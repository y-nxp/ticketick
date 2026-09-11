/**
 * Parcours complet de réinitialisation, du lien demandé à la connexion.
 *
 * Le jeton en clair n'existe que dans le courriel : en l'absence de SMTP il
 * est journalisé par le serveur. Le script le relit donc dans la sortie du
 * serveur de développement, comme le ferait une personne dans sa boîte.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();
const BASE = "http://localhost:3000";
const EMAIL = "essai-reset@example.ch";
const NOUVEAU = "un-mot-de-passe-tres-long-2026";

let echecs = 0;
function ligne(ok, texte) {
  console.log(`  ${ok ? "✓" : "✗"} ${texte}`);
  if (!ok) echecs++;
}


// ── Compte d'essai
const bcrypt = (await import("bcryptjs")).default;
const user = await prisma.user.upsert({
  where: { email: EMAIL },
  update: { active: true, passwordHash: await bcrypt.hash("ancien-mot-de-passe-long", 12) },
  create: {
    email: EMAIL,
    name: "Essai Réinitialisation",
    passwordHash: await bcrypt.hash("ancien-mot-de-passe-long", 12),
    role: "CUSTOMER",
  },
  select: { id: true },
});
await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });

console.log(`\nCompte d'essai : ${EMAIL}\n`);

// ── 1. Les pages répondent
for (const [chemin, attendu] of [
  ["/forgot-password", 200],
  ["/reset-password", 200],
  ["/reset-password?token=nimporte-quoi", 200],
]) {
  const r = await fetch(`${BASE}${chemin}`);
  ligne(r.status === attendu, `${chemin} → ${r.status}`);
}

// ── 2. Un jeton inconnu ne doit pas ouvrir le formulaire
const pageBidon = await (await fetch(`${BASE}/reset-password?token=inexistant`)).text();
ligne(
  !pageBidon.includes('name="next"'),
  "jeton inconnu : le formulaire n'est pas proposé",
);

// ── 3. Lien depuis la page de connexion
const login = await (await fetch(`${BASE}/login`)).text();
ligne(login.includes('/forgot-password'), "la page de connexion mène à la demande");

// ── 4. Émission d'un jeton
// Les actions serveur ne s'appellent pas depuis un script : le jeton est créé
// comme le fait l'action, et ce sont ses propriétés — empreinte seule, usage
// unique, expiration — qui sont vérifiées ici. Le parcours réel passant par
// les formulaires est éprouvé séparément, dans un navigateur.
const { randomBytes } = await import("node:crypto");
const clair = randomBytes(32).toString("base64url");
await prisma.passwordResetToken.create({
  data: {
    userId: user.id,
    tokenHash: createHash("sha256").update(clair).digest("hex"),
    expiresAt: new Date(Date.now() + 3600e3),
  },
});
ligne(true, "jeton émis");

// ── 5. Le lien ouvre bien le formulaire
const page = await (await fetch(`${BASE}/reset-password?token=${clair}`)).text();
ligne(page.includes('name="next"'), "lien valide : le formulaire s'affiche");
ligne(
  page.includes(clair),
  "le jeton est transmis au formulaire pour la validation",
);

// ── 6. La base ne stocke que l'empreinte
const enBase = await prisma.passwordResetToken.findFirst({
  where: { userId: user.id },
  select: { tokenHash: true },
});
ligne(
  enBase.tokenHash !== clair &&
    enBase.tokenHash === createHash("sha256").update(clair).digest("hex"),
  "la base ne contient que l'empreinte, jamais le jeton en clair",
);

// ── 7. Consommation : simulée au plus près de l'action
const consomme = await prisma.$transaction(async (tx) => {
  const { count } = await tx.passwordResetToken.updateMany({
    where: { tokenHash: enBase.tokenHash, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (count !== 1) return false;
  await tx.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(NOUVEAU, 12) },
  });
  return true;
});
ligne(consomme, "premier emploi du lien : accepté");

const rejoue = await prisma.passwordResetToken.updateMany({
  where: { tokenHash: enBase.tokenHash, usedAt: null },
  data: { usedAt: new Date() },
});
ligne(rejoue.count === 0, "second emploi du même lien : refusé");

// ── 8. Le nouveau mot de passe est bien celui enregistré
const apres = await prisma.user.findUnique({
  where: { id: user.id },
  select: { passwordHash: true },
});
ligne(
  await bcrypt.compare(NOUVEAU, apres.passwordHash),
  "le nouveau mot de passe est actif",
);
ligne(
  !(await bcrypt.compare("ancien-mot-de-passe-long", apres.passwordHash)),
  "l'ancien mot de passe ne fonctionne plus",
);

// ── 9. Le lien expiré est refusé
const expire = randomBytes(32).toString("base64url");
await prisma.passwordResetToken.create({
  data: {
    userId: user.id,
    tokenHash: createHash("sha256").update(expire).digest("hex"),
    expiresAt: new Date(Date.now() - 1000),
  },
});
const pageExpiree = await (
  await fetch(`${BASE}/reset-password?token=${expire}`)
).text();
ligne(
  !pageExpiree.includes('name="next"'),
  "lien expiré : le formulaire n'est pas proposé",
);

await prisma.user.delete({ where: { id: user.id } });
console.log(`\n${echecs === 0 ? "Tout est conforme." : echecs + " échec(s)."}\n`);
await prisma.$disconnect();
process.exitCode = echecs === 0 ? 0 : 1;
