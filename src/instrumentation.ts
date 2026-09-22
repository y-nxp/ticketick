export async function register(): Promise<void> {
  // `register` tourne aussi sur l'Edge runtime et pendant `next build`, où
  // Prisma et les minuteries n'ont rien à faire.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startHoldJanitor } = await import("@/lib/orders/hold-janitor");
  startHoldJanitor();
}
