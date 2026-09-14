/** Sous le breakpoint `lg` : le bloc billets n’est plus à côté, il faut y aller. */
export function isStackedLayout() {
  return typeof window !== "undefined" &&
    window.matchMedia("(max-width: 1023px)").matches;
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function scrollToIdIfStacked(id: string) {
  if (!isStackedLayout()) return;
  window.requestAnimationFrame(() => scrollToId(id));
}
