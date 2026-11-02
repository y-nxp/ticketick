/**
 * Partage d'un montant selon des poids, au centime près : la somme des parts
 * redonne toujours le montant (reste d'arrondi aux plus grosses fractions).
 * Sert à ventiler une vente sur plusieurs concerts dans les statistiques.
 */
export function shareOut(amount: number, weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
  if (weights.length === 0) return [];
  if (total <= 0) return weights.map((_, i) => (i === 0 ? amount : 0));
  const exact = weights.map((w) => (amount * Math.max(0, w)) / total);
  const parts = exact.map((x) => Math.trunc(x));
  let rest = amount - parts.reduce((s, p) => s + p, 0);
  const order = exact
    .map((x, i) => ({ i, frac: Math.abs(x - Math.trunc(x)) }))
    .sort((a, b) => b.frac - a.frac);
  const step = Math.sign(rest);
  for (let k = 0; rest !== 0; k = (k + 1) % order.length) {
    parts[order[k]!.i]! += step;
    rest -= step;
  }
  return parts;
}
