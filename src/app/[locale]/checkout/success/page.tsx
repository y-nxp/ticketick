import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { CartClearer } from "@/components/cart/cart-clearer";

export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { locale } = await params;
  const { ref } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("checkout");

  return (
    <div className="container-page max-w-2xl py-20 text-center">
      <CartClearer />
      <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--success)]/12">
        <CheckCircle2 className="size-8 text-[var(--success)]" />
      </div>
      <h1 className="mt-6 text-3xl font-bold">{t("success")}</h1>
      {ref && (
        <p className="mt-4 font-mono text-sm text-muted-foreground">
          Réf. {ref}
        </p>
      )}
      <Link href="/account" className="mt-6 inline-block">
        <Button size="lg">{t("backHome")}</Button>
      </Link>
    </div>
  );
}
