import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * Logo TICKETICK, toujours depuis les fichiers de /public/brand : la version
 * claire et la version inverse sont permutées par la classe `dark` de <html>,
 * sans état React. Hauteur minimale 18 px (≈ 177 px de large).
 */
export function Logo({ className }: { className?: string }) {
  const size = "h-[18px] w-auto xl:h-[22px]";
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
        src="/brand/ticketick-logo.svg"
        alt=""
        width={689}
        height={70}
        className={cn(size, "dark:hidden")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/ticketick-logo-inverse.svg"
        alt=""
        width={689}
        height={70}
        className={cn(size, "hidden dark:block")}
      />
    </Link>
  );
}
