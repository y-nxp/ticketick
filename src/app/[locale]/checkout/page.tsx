"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard, Landmark, CheckCircle2, Loader2, Copy } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/components/cart/cart-context";
import { formatPrice } from "@/lib/utils";

type Method = "CARD" | "IBAN";

interface OrderResult {
  reference: string;
  status: string;
  iban?: string;
  beneficiary?: string;
  totalCents: number;
  currency: string;
}

export default function CheckoutPage() {
  return (
    <React.Suspense fallback={null}>
      <CheckoutInner />
    </React.Suspense>
  );
}

function CheckoutInner() {
  const t = useTranslations("checkout");
  const tc = useTranslations("cart");
  const locale = useLocale();
  const { lines, subtotalCents, clear } = useCart();
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled") === "1";

  const [method, setMethod] = React.useState<Method>("CARD");
  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<OrderResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fee = Math.round(subtotalCents * 0.05);
  const total = subtotalCents + fee;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          locale,
          paymentMethod: method,
          lines: lines.map((l) => ({
            ticketTypeId: l.ticketTypeId,
            ticketName: l.ticketName,
            eventTitle: l.eventTitle,
            unitPriceCents: l.unitPriceCents,
            quantity: l.quantity,
            currency: l.currency,
          })),
        }),
      });
      // 503 : aucun encaissement n'est configuré. La commande a été annulée
      // côté serveur et les places rendues ; le dire plutôt que d'inviter à
      // réessayer, ce qui échouerait autant de fois que l'acheteur insiste.
      if (res.status === 503) {
        setError(t("unavailable"));
        return;
      }
      if (!res.ok) throw new Error("checkout_failed");
      const data: OrderResult & { checkoutUrl?: string } = await res.json();

      // Paiement carte : redirection vers la page de paiement Stripe.
      // Le panier sera vidé sur la page de succès après confirmation.
      if (method === "CARD" && data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }

      // Virement IBAN : confirmation immédiate avec instructions.
      setResult(data);
      clear();
    } catch {
      setError(t("failed"));
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="container-page max-w-2xl py-16 text-center">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-[var(--success)]/12">
          <CheckCircle2 className="size-8 text-[var(--success)]" />
        </div>
        <h1 className="mt-6 text-3xl font-bold">{t("success")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t("successHint", { email: form.email })}
        </p>
        <div className="mt-6 rounded-2xl border border-border bg-card p-5 text-left">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Réf.</span>
            <span className="font-mono font-semibold">{result.reference}</span>
          </div>
          {result.iban && (
            <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <p className="font-medium">{t("iban")}</p>
              <Row label="IBAN" value={result.iban} copyable />
              <Row label="Bénéficiaire" value={result.beneficiary ?? ""} />
              <Row
                label={tc("total")}
                value={formatPrice(result.totalCents, `${locale}-CH`)}
              />
              <Row label="Communication" value={result.reference} copyable />
            </div>
          )}
        </div>
        <Link href="/" className="mt-6 inline-block">
          <Button size="lg">{t("backHome")}</Button>
        </Link>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="text-2xl font-bold">{tc("empty")}</h1>
        <Link href="/" className="mt-6 inline-block">
          <Button size="lg">{tc("browse")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      {canceled && (
        <p className="mt-4 rounded-xl bg-warning/15 px-4 py-3 text-sm">
          {locale === "de"
            ? "Zahlung abgebrochen. Ihr Warenkorb wurde beibehalten."
            : locale === "it"
              ? "Pagamento annullato. Il carrello è stato conservato."
              : locale === "en"
                ? "Payment canceled. Your cart has been kept."
                : "Paiement annulé. Votre panier a été conservé."}
        </p>
      )}
      <form
        onSubmit={submit}
        className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]"
      >
        <div className="space-y-8">
          {/* Coordonnées */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("contact")}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label={t("firstName")}
                value={form.firstName}
                onChange={(v) => setForm((f) => ({ ...f, firstName: v }))}
                required
              />
              <Input
                label={t("lastName")}
                value={form.lastName}
                onChange={(v) => setForm((f) => ({ ...f, lastName: v }))}
                required
              />
              <Input
                label={t("email")}
                type="email"
                value={form.email}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                hint={t("emailHint")}
                required
                className="sm:col-span-2"
              />
              <Input
                label={t("phone")}
                type="tel"
                value={form.phone}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                className="sm:col-span-2"
              />
            </div>
          </section>

          {/* Paiement */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("paymentMethod")}</h2>
            <div className="mt-4 space-y-3">
              <PaymentOption
                active={method === "CARD"}
                onClick={() => setMethod("CARD")}
                icon={<CreditCard className="size-5" />}
                title={t("card")}
                hint={t("cardHint")}
              />
              <PaymentOption
                active={method === "IBAN"}
                onClick={() => setMethod("IBAN")}
                icon={<Landmark className="size-5" />}
                title={t("iban")}
                hint={t("ibanHint")}
              />
            </div>
          </section>

          {error && (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* Récapitulatif */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("orderSummary")}</h2>
            <ul className="mt-4 space-y-3">
              {lines.map((l) => (
                <li
                  key={l.ticketTypeId}
                  className="flex justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {l.eventTitle}
                    </span>
                    <span className="text-muted-foreground">
                      {l.quantity} × {l.ticketName}
                    </span>
                  </span>
                  <span className="whitespace-nowrap font-medium">
                    {formatPrice(l.unitPriceCents * l.quantity, `${locale}-CH`)}
                  </span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{tc("subtotal")}</dt>
                <dd>{formatPrice(subtotalCents, `${locale}-CH`)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{tc("serviceFee")}</dt>
                <dd>{formatPrice(fee, `${locale}-CH`)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <dt>{tc("total")}</dt>
                <dd>{formatPrice(total, `${locale}-CH`)}</dd>
              </div>
            </dl>
            <Button
              type="submit"
              size="lg"
              className="mt-5 w-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("processing")}
                </>
              ) : (
                t("payNow", { amount: formatPrice(total, `${locale}-CH`) })
              )}
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  hint,
  required,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-sm font-medium">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-border bg-background px-3.5 text-sm outline-none focus:border-ring"
      />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function PaymentOption({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
        active
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-secondary/50"
      }`}
    >
      <span
        className={`mt-0.5 grid size-9 place-items-center rounded-full ${
          active ? "bg-primary text-primary-foreground" : "bg-secondary"
        }`}
      >
        {icon}
      </span>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </span>
      <span
        className={`ml-auto mt-1 size-4 shrink-0 rounded-full border-2 ${
          active ? "border-primary bg-primary" : "border-border"
        }`}
      />
    </button>
  );
}

function Row({
  label,
  value,
  copyable,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-medium">
        {value}
        {copyable && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <CheckCircle2 className="size-4 text-[var(--success)]" />
            ) : (
              <Copy className="size-4" />
            )}
          </button>
        )}
      </span>
    </div>
  );
}
