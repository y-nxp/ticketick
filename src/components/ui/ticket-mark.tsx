import { cn } from "@/lib/utils";

/**
 * Motif de signature : le billet à encoches du logo, seul (incliné de −5°,
 * trois barres évidées). À garder rare ; ne remplace jamais le logo.
 * Jamais les trois barres sans le billet (lu comme un menu ou un Ξ).
 */
export function TicketMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-30 -25 650 750"
      aria-hidden
      focusable="false"
      className={cn("h-[0.95em] w-auto shrink-0 fill-primary", className)}
    >
      <path
        transform="rotate(-5 295 350)"
        fillRule="evenodd"
        d="M24 0H566A24 24 0 0 1 590 24V264A86 86 0 0 0 590 436V676A24 24 0 0 1 566 700H24A24 24 0 0 1 0 676V436A86 86 0 0 0 0 264V24A24 24 0 0 1 24 0ZM109 122V238H481V122ZM170 292V408H420V292ZM109 462V578H481V462Z"
      />
    </svg>
  );
}
