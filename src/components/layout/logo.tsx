import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const TICK_PATHS = [
  "m57.057 212.19-2.2996-3.4882 0.95601-1.2092 3.1781 4.6974z",
  "m52.272 212.19v-7.6998h1.5916v7.6998z",
  "m53.419 210.58v-1.9689q0.26355-0.32039 0.5271-0.63562 0.26355-0.31522 0.5271-0.63045 0.26872-0.31522 0.53226-0.63562l1.9017-2.2221h1.9069l-3.2504 3.7517h-0.12402z",
  "m47.998 212.31q-1.0542 0-1.8862-0.48059-0.82682-0.48575-1.3022-1.3746-0.47025-0.894-0.47025-2.1136 0-1.2299 0.47025-2.1239 0.47542-0.894 1.3022-1.3746 0.83199-0.48059 1.8862-0.48059 0.67696 0 1.2557 0.20154t1.0232 0.57361q0.44958 0.37207 0.7338 0.894 0.28422 0.52193 0.37724 1.1679h-1.6071q-0.06718-0.34106-0.22221-0.60461-0.15503-0.26872-0.3824-0.44959-0.22738-0.18603-0.52193-0.27905-0.28939-0.0982-0.63562-0.0982-0.65629 0-1.1214 0.31522-0.45992 0.31523-0.70796 0.894-0.24805 0.57361-0.24805 1.3642 0 0.78548 0.24288 1.3591 0.24805 0.57361 0.71313 0.88883 0.46509 0.31523 1.1214 0.31523 0.34623 0 0.63562-0.093 0.28939-0.093 0.51676-0.27905 0.22738-0.18604 0.3824-0.44959 0.15503-0.26354 0.23254-0.59944h1.602q-0.09302 0.64079-0.37724 1.1627-0.28422 0.52193-0.7338 0.894-0.44958 0.37206-1.0284 0.5736-0.57361 0.19637-1.2506 0.19637z",
  "m43.44 204.49v7.6998h-1.5916v-7.6998z",
  "m34.785 205.85v-1.3643h6.258v1.3643h-2.3306v6.3355h-1.5916v-6.3355z",
];

/**
 * Wordmark TICKETICK : TICK + « E » (3 barres) + TICK.
 * Le texte hérite de `currentColor` (anthracite en clair, blanc en sombre),
 * le symbole reste toujours violet — conformément à la charte.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 57.431 7.9847"
      role="img"
      aria-label="ticketick"
      className={cn("h-6 w-auto", className)}
    >
      <g transform="translate(-34.785 -204.33)" strokeWidth=".26458">
        <g transform="translate(0 -.018455)" fill="currentColor">
          {TICK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g transform="translate(33.324 -.018455)" fill="currentColor">
          {TICK_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
        <g transform="matrix(1.1132 0 0 1 -5.407 -.018331)" fill="#6C5CE7">
          <rect x="58.677" y="204.49" width="6.4414" height="2.0155" ry="1.0077" />
          <rect x="58.677" y="207.33" width="6.4414" height="2.0155" ry="1.0077" />
          <rect x="58.677" y="210.17" width="6.4414" height="2.0155" ry="1.0077" />
        </g>
      </g>
    </svg>
  );
}

/** Symbole seul (3 barres) — espaces restreints, min. 16 px. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="ticketick"
      className={cn("size-8", className)}
      fill="#6C5CE7"
    >
      <rect x="4" y="2.5" width="24" height="7" rx="3.5" />
      <rect x="4" y="12.5" width="24" height="7" rx="3.5" />
      <rect x="4" y="22.5" width="24" height="7" rx="3.5" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="ticketick"
      // Zone d'exclusion : espace libre ≈ hauteur d'une barre du « E »
      className={cn(
        "inline-flex shrink-0 items-center p-1 transition-opacity hover:opacity-80",
        className,
      )}
    >
      {/* 22px ≈ 158px de large, 26px ≈ 187px : au-dessus du minimum de 120px */}
      <Wordmark className="h-[22px] w-auto text-foreground sm:h-[26px]" />
    </Link>
  );
}
