import { redirect } from "@/i18n/navigation";

/** Ancienne adresse : PayPal fait désormais partie de l'écran Encaissement. */
export default async function AdminPaypalPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ o?: string }>;
}) {
  const { locale } = await params;
  const { o } = await searchParams;
  redirect({
    href: { pathname: "/admin/payments", query: o ? { o } : {} },
    locale,
  });
}
