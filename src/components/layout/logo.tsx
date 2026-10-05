import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Logo TICKETICK, toujours depuis les fichiers de /public/brand : la version
 * claire et la version inverse sont permutées par la classe `dark` de <html>,
 * sans état React. Sous 24 px de haut, la version « small » (Jost SemiBold) ;
 * capitales de 18 px au minimum (≈ 155 px de large). Le cadre du SVG inclut le
 * débord du C (728 unités pour 700 de capitales), d'où les hauteurs ci-dessous.
 */
export function Logo({ className }: { className?: string }) {
  const size = "h-[18.72px] w-auto xl:h-[22.88px]";
  return (
    <Link
      href="/"
      aria-label="ticketick"
      className={cn(
        "inline-flex shrink-0 items-center p-1 transition-opacity hover:opacity-80",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/ticketick-logo-small.svg"
        alt=""
        width={601}
        height={73}
        className={cn(size, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/ticketick-logo-small-inverse.svg"
        alt=""
        width={601}
        height={73}
        className={cn(size, "hidden dark:block")}
      />
    </Link>
  );
}
