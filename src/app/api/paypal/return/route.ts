import { NextResponse } from "next/server";
import { publicAppOrigin } from "@/lib/app-url";
import { routing } from "@/i18n/routing";
import { settlePaypalReturn } from "@/lib/orders/settle-paypal";

const REFERENCE = /^[A-Z0-9-]{4,40}$/;

function localePrefix(value: string | null): string {
  const locale = routing.locales.find((l) => l === value) ?? routing.defaultLocale;
  return locale === routing.defaultLocale ? "" : `/${locale}`;
}

/** Retour de l'acheteur depuis PayPal : capture, puis page de confirmation. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicAppOrigin(request);
  const prefix = localePrefix(url.searchParams.get("locale"));
  const reference = url.searchParams.get("ref") ?? "";
  const paypalOrderId = url.searchParams.get("token") ?? "";

  const back = NextResponse.redirect(`${origin}${prefix}/checkout?canceled=1`, 303);
  if (!REFERENCE.test(reference) || !paypalOrderId) return back;

  let outcome;
  try {
    outcome = await settlePaypalReturn(reference, paypalOrderId);
  } catch (error) {
    console.error("[paypal] retour", reference, error);
    return back;
  }

  if (outcome === "paid" || outcome === "paid_late") {
    return NextResponse.redirect(
      `${origin}${prefix}/checkout/success?ref=${encodeURIComponent(reference)}`,
      303,
    );
  }
  return back;
}
