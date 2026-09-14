import { ShopIdentityFrame } from "@/components/branding/shop-identity-frame";

export default function CartLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ShopIdentityFrame>{children}</ShopIdentityFrame>;
}
