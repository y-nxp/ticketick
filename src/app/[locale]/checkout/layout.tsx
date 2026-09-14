import { ShopIdentityFrame } from "@/components/branding/shop-identity-frame";

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <ShopIdentityFrame>{children}</ShopIdentityFrame>;
}
