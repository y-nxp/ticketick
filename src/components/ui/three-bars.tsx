import { cn } from "@/lib/utils";

/**
 * Motif de signature : le E du logo seul (barre du milieu plus courte et
 * centrée, bouts droits). À garder rare ; ne remplace jamais le logo.
 */
export function ThreeBars({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 590 700"
      aria-hidden
      focusable="false"
      className={cn("h-[0.7em] w-auto shrink-0 fill-primary", className)}
    >
      <rect width="590" height="145" />
      <rect x="89" y="277.5" width="412" height="145" />
      <rect y="555" width="590" height="145" />
    </svg>
  );
}
