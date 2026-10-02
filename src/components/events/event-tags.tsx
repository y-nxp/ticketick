import { cn } from "@/lib/utils";

/** Étiquettes de l'organisateur (« Grands duos », « Bel canto »), à ses couleurs. */
export function EventTags({
  tags,
  large = false,
  className,
}: {
  tags: string[];
  large?: boolean;
  className?: string;
}) {
  if (tags.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)}>
      {tags.map((tag) => (
        <li
          key={tag}
          className={cn(
            "rounded-full bg-primary font-semibold uppercase leading-none tracking-wider text-primary-foreground",
            large ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]",
          )}
        >
          {tag}
        </li>
      ))}
    </ul>
  );
}
