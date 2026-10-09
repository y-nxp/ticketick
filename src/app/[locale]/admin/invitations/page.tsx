import { redirect } from "@/i18n/navigation";

export default async function InvitationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ organizer?: string }>;
}) {
  const { locale } = await params;
  const { organizer } = await searchParams;
  redirect({
    href: {
      pathname: "/admin/reports",
      query: { view: "invitations", ...(organizer ? { organizer } : {}) },
    },
    locale,
  });
}
