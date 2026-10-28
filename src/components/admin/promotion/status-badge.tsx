import type { PromotionPostStatus } from "@prisma/client";
import { Badge, type BadgeProps } from "@/components/ui/badge";

const VARIANT: Record<PromotionPostStatus, BadgeProps["variant"]> = {
  DRAFT: "secondary",
  SCHEDULED: "default",
  PUBLISHING: "default",
  PUBLISHED: "success",
  FAILED: "outline",
  CANCELLED: "secondary",
};

/** État d'une publication ; le libellé vient de `admin.promotion.status`. */
export function PostStatusBadge({ status, label }: { status: PromotionPostStatus; label: string }) {
  return (
    <Badge variant={VARIANT[status]} className={status === "FAILED" ? "text-destructive" : undefined}>
      {label}
    </Badge>
  );
}
