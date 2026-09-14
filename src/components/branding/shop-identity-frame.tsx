import { cookies } from "next/headers";
import { OrganizerShell } from "@/components/branding/organizer-shell";
import { getOrganizerBySlug } from "@/lib/data/events";
import { parseGoOrigin, SHOP_ORIGIN_COOKIE } from "@/lib/shop-origin";

/**
 * Reprend la charte du portail `/go` sur le panier, le paiement et
 * la confirmation, tant que le cookie d'origine est posé.
 */
export async function ShopIdentityFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  const raw = (await cookies()).get(SHOP_ORIGIN_COOKIE)?.value;
  const origin = parseGoOrigin(raw);
  if (!origin) return children;

  const organizer = await getOrganizerBySlug(origin.orgSlug);
  if (!organizer) return children;

  return <OrganizerShell organizer={organizer}>{children}</OrganizerShell>;
}
