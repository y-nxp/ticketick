"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { CreditCard, Landmark, CheckCircle2, Loader2, Copy, Clock } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ContinueShopping } from "@/components/cart/continue-shopping";
import {
  EventOptions,
  type OptionDraft,
} from "@/components/checkout/event-options";
import { useCart } from "@/components/cart/cart-context";
import {
  isStackedLayout,
  scrollToIdIfStacked,
} from "@/lib/scroll-into-view";
import { cn, formatPrice } from "@/lib/utils";
import {
  checkCartAvailability,
  getCartPaymentMethods,
} from "@/lib/orders/payment-actions";
import { formatHoldClock } from "@/lib/orders/reservation";

type Method = "CARD" | "IBAN";

interface OrderResult {
  reference: string;
  status: string;
  iban?: string;
  beneficiary?: string;
  totalCents: number;
  currency: string;
}

interface SeatHold {
  reference: string;
  checkoutUrl?: string;
  reservedUntil: string;
  cartKey: string;
}

const HOLD_KEY = "ticketick.hold.v1";

type HoldOutcome =
  | { ok: true; hold: SeatHold }
  | { ok: false; error: string };

const inflightHolds = new Map<string, Promise<HoldOutcome>>();

function readHold(): SeatHold | null {
  try {
    const raw =
      localStorage.getItem(HOLD_KEY) ?? sessionStorage.getItem(HOLD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SeatHold;
    if (!parsed.reference || !parsed.reservedUntil || !parsed.cartKey) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeHold(hold: SeatHold): void {
  localStorage.setItem(HOLD_KEY, JSON.stringify(hold));
  sessionStorage.removeItem(HOLD_KEY);
}

function clearHold(): void {
  localStorage.removeItem(HOLD_KEY);
  sessionStorage.removeItem(HOLD_KEY);
}

function readHoldSafe(): SeatHold | null {
  if (typeof window === "undefined") return null;
  return readHold();
}

function linesFromCartKey(
  cartKey: string,
): { ticketTypeId: string; quantity: number }[] {
  if (!cartKey) return [];
  return cartKey.split(",").map((part) => {
    const sep = part.lastIndexOf(":");
    return {
      ticketTypeId: part.slice(0, sep),
      quantity: Number(part.slice(sep + 1)),
    };
  });
}

function requestHold(args: {
  cartKey: string;
  lines: { ticketTypeId: string; quantity: number }[];
  locale: string;
  replaceReference?: string;
}): Promise<HoldOutcome> {
  const existing = inflightHolds.get(args.cartKey);
  if (existing) return existing;
  const promise = (async (): Promise<HoldOutcome> => {
    const res = await fetch("/api/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        locale: args.locale,
        lines: args.lines,
        replaceReference: args.replaceReference,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      reference?: string;
      reservedUntil?: string;
      error?: string;
    } | null;
    if (!res.ok || !body?.reference || !body.reservedUntil) {
      inflightHolds.delete(args.cartKey);
      return { ok: false, error: body?.error ?? "failed" };
    }
    const hold: SeatHold = {
      reference: body.reference,
      reservedUntil: body.reservedUntil,
      cartKey: args.cartKey,
    };
    writeHold(hold);
    return { ok: true, hold };
  })().catch((): HoldOutcome => {
    inflightHolds.delete(args.cartKey);
    return { ok: false, error: "failed" };
  });
  inflightHolds.set(args.cartKey, promise);
  return promise;
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
  const { lines, subtotalCents, clear, hydrated } = useCart();
  const searchParams = useSearchParams();
  const canceled = searchParams.get("canceled") === "1";

  const [method, setMethod] = React.useState<Method>("CARD");
  const [offer, setOffer] = React.useState({ card: true, iban: true });
  const [form, setForm] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<OrderResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [createdHold, setCreatedHold] = React.useState<SeatHold | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [holdExpired, setHoldExpired] = React.useState(false);
  const [failedFor, setFailedFor] = React.useState<string | null>(null);
  const [checkingSeats, setCheckingSeats] = React.useState(false);
  const [seatsOk, setSeatsOk] = React.useState<boolean | null>(null);
  const [optionDraft, setOptionDraft] = React.useState<OptionDraft>({
    payload: [],
    amountCents: 0,
  });

  const ticketIds = lines.map((l) => l.ticketTypeId).join(",");

  React.useEffect(() => {
    if (!hydrated || lines.length === 0) return;
    if (isStackedLayout()) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [hydrated, lines.length]);

  React.useEffect(() => {
    let ignore = false;
    getCartPaymentMethods(ticketIds ? ticketIds.split(",") : []).then(
      (next) => {
        if (ignore) return;
        setOffer(next);
        setMethod((actuel) => {
          if (actuel === "CARD" && next.card) return actuel;
          if (actuel === "IBAN" && next.iban) return actuel;
          if (next.card) return "CARD";
          if (next.iban) return "IBAN";
          return actuel;
        });
      },
    );
    return () => {
      ignore = true;
    };
  }, [ticketIds]);

  const sessionIds = [...new Set(lines.map((l) => l.sessionId))];
  const total = subtotalCents + optionDraft.amountCents;
  const cartKey = lines
    .map((l) => `${l.ticketTypeId}:${l.quantity}`)
    .sort()
    .join(",");

  const stored = hydrated ? readHoldSafe() : null;
  const storedUntil = stored ? Date.parse(stored.reservedUntil) : NaN;
  const storedDead =
    Boolean(stored) &&
    (!Number.isFinite(storedUntil) || storedUntil <= now);
  const storedMatches = Boolean(
    stored && stored.cartKey === cartKey && !storedDead,
  );
  const createdAlive =
    createdHold &&
    createdHold.cartKey === cartKey &&
    Date.parse(createdHold.reservedUntil) > now;

  let hold: SeatHold | null = null;
  if (storedMatches && stored) {
    if (canceled && stored.checkoutUrl) {
      const next = { ...stored };
      delete next.checkoutUrl;
      hold = next;
    } else {
      hold = stored;
    }
  } else if (createdAlive) {
    hold = createdHold;
  }

  const msLeft = hold ? Date.parse(hold.reservedUntil) - now : 0;
  const holdActive = Boolean(hold && msLeft > 0);
  const createdExpired =
    Boolean(createdHold && createdHold.cartKey === cartKey) && !createdAlive;
  const showExpired = holdExpired || storedDead || createdExpired;

  const needsCreate =
    hydrated &&
    Boolean(cartKey) &&
    !holdExpired &&
    !storedMatches &&
    !storedDead &&
    failedFor !== cartKey;

  const creatingHold = needsCreate && !createdAlive && !error;
  const replaceReference =
    stored && stored.cartKey !== cartKey ? stored.reference : undefined;

  React.useEffect(() => {
    if (!storedDead || !stored?.cartKey) return;
    inflightHolds.delete(stored.cartKey);
    clearHold();
  }, [storedDead, stored?.cartKey]);

  React.useEffect(() => {
    if (!storedMatches || !canceled || !stored?.checkoutUrl) return;
    const next = { ...stored };
    delete next.checkoutUrl;
    writeHold(next);
  }, [storedMatches, canceled, stored]);

  React.useEffect(() => {
    // Le chrono démarre à l'arrivée sur /checkout, pas à l'ajout au panier.
    // Attendre le panier : un `cartKey` vide au premier rendu ferait
    // croire à tort que la rétention est périmée (retour PostFinance).
    if (!needsCreate) return;

    let cancelled = false;
    requestHold({
      cartKey,
      locale,
      lines: linesFromCartKey(cartKey),
      replaceReference,
    }).then((outcome) => {
      if (cancelled) return;
      if (outcome.ok) {
        setCreatedHold(outcome.hold);
        setHoldExpired(false);
        setFailedFor(null);
        setError(null);
        return;
      }
      setCreatedHold(null);
      setFailedFor(cartKey);
      if (t.has(outcome.error)) {
        setError(t(outcome.error));
        return;
      }
      setError(t("failed"));
    });

    return () => {
      cancelled = true;
    };
  }, [needsCreate, cartKey, locale, t, replaceReference]);

  React.useEffect(() => {
    if (!hold) return;
    const tick = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(tick);
  }, [hold]);

  React.useEffect(() => {
    if (!hold || msLeft > 0) return;
    inflightHolds.delete(hold.cartKey);
    clearHold();
  }, [hold, msLeft]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setHoldExpired(false);
    setSeatsOk(null);

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          locale,
          paymentMethod: method,
          holdReference: hold?.reference,
          options: optionDraft.payload,
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
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        const cle = body?.error;
        if (cle && t.has(cle)) {
          setError(t(cle));
          return;
        }
        throw new Error("checkout_failed");
      }
      const data: OrderResult & {
        checkoutUrl?: string;
        reservedUntil?: string;
      } = await res.json();

      // Paiement carte : on part tout de suite. Rester sur la page avec
      // l'URL PostFinance ferait alterner « Continuer » et « Reprendre ».
      if (method === "CARD" && data.checkoutUrl && data.reservedUntil) {
        const nextHold = {
          reference: data.reference,
          reservedUntil: data.reservedUntil,
          cartKey,
        };
        writeHold(nextHold);
        setCreatedHold(nextHold);
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
        <ContinueShopping
          eventSlug={lines[0]?.eventSlug}
          className={`mt-6 inline-flex ${buttonVariants({ size: "lg" })}`}
        >
          {t("backHome")}
        </ContinueShopping>
      </div>
    );
  }

  if (!hydrated) {
    return null;
  }

  if (lines.length === 0) {
    return (
      <div className="container-page py-20 text-center">
        <h1 className="text-2xl font-bold">{tc("empty")}</h1>
        <ContinueShopping
          className={`mt-6 inline-flex ${buttonVariants({ size: "lg" })}`}
        >
          {tc("browse")}
        </ContinueShopping>
      </div>
    );
  }

  const payDisabled =
    submitting ||
    creatingHold ||
    checkingSeats ||
    seatsOk === false ||
    (!offer.card && !offer.iban);

  function payActions(id: string) {
    return (
      <>
        <Button
          id={id}
          type="submit"
          size="lg"
          className="mt-5 w-full scroll-mt-24"
          disabled={payDisabled}
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
        <ContinueShopping
          eventSlug={lines[0]?.eventSlug}
          className={cn(
            buttonVariants({ variant: "ghost", size: "lg" }),
            "mt-2 w-full",
          )}
        >
          {tc("continue")}
        </ContinueShopping>
      </>
    );
  }

  return (
    <div className="container-page py-10">
      <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
      {creatingHold && !holdActive ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
          <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-primary" />
          <p className="font-semibold">{t("reserving")}</p>
        </div>
      ) : null}
      {holdActive ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3">
          <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
          <div>
            <p className="font-semibold tabular-nums">
              {t("reserved", { time: formatHoldClock(msLeft) })}
            </p>
            <p className="text-sm text-muted-foreground">
              {canceled ? t("canceledHold") : t("reservedHint")}
            </p>
          </div>
        </div>
      ) : null}
      {showExpired ? (
        <div className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm">
          <p className="text-destructive">{t("reservedExpired")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={checkingSeats}
              onClick={async () => {
                setCheckingSeats(true);
                setSeatsOk(null);
                try {
                  const result = await checkCartAvailability(
                    lines.map((l) => ({
                      ticketTypeId: l.ticketTypeId,
                      quantity: l.quantity,
                    })),
                  );
                  setSeatsOk(result.available);
                  if (result.available) {
                    inflightHolds.delete(cartKey);
                    setCreatedHold(null);
                    setFailedFor(null);
                    setHoldExpired(false);
                  }
                } catch {
                  setSeatsOk(false);
                } finally {
                  setCheckingSeats(false);
                }
              }}
            >
              {checkingSeats ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("checkingAvailability")}
                </>
              ) : (
                t("checkAvailability")
              )}
            </Button>
            {lines[0]?.eventSlug ? (
              <ContinueShopping
                eventSlug={lines[0].eventSlug}
                className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
              >
                {t("changeSelection")}
              </ContinueShopping>
            ) : null}
          </div>
          {seatsOk === true ? (
            <p className="mt-3 font-medium text-[var(--success)]">
              {t("seatsStillAvailable")}
            </p>
          ) : null}
          {seatsOk === false ? (
            <p className="mt-3 font-medium text-destructive">
              {t("seatsNoLongerAvailable")}
            </p>
          ) : null}
        </div>
      ) : null}
      {canceled && !holdActive && !showExpired ? (
        <p className="mt-4 rounded-xl bg-warning/15 px-4 py-3 text-sm">
          {t("canceled")}
        </p>
      ) : null}
      <form
        id="checkout-form"
        onSubmit={submit}
        className="mt-8 grid scroll-mt-24 gap-8 lg:grid-cols-[1fr_360px]"
      >
        <div className="order-2 space-y-8 lg:order-1">
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

          <EventOptions
            sessionIds={sessionIds}
            locale={locale}
            onChange={setOptionDraft}
          />

          {/* Paiement */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="text-lg font-semibold">{t("paymentMethod")}</h2>
            <div className="mt-4 space-y-3">
              {offer.card ? (
                <PaymentOption
                  active={method === "CARD"}
                  onClick={() => {
                    setMethod("CARD");
                    scrollToIdIfStacked("checkout-pay-mobile");
                  }}
                  icon={<CreditCard className="size-5" />}
                  title={t("card")}
                  hint={t("cardHint")}
                />
              ) : null}
              {offer.iban ? (
                <PaymentOption
                  active={method === "IBAN"}
                  onClick={() => {
                    setMethod("IBAN");
                    scrollToIdIfStacked("checkout-pay-mobile");
                  }}
                  icon={<Landmark className="size-5" />}
                  title={t("iban")}
                  hint={t("ibanHint")}
                />
              ) : null}
              {!offer.card && !offer.iban ? (
                <p className="text-sm text-muted-foreground">
                  {t("noMethod")}
                </p>
              ) : null}
            </div>
          </section>

          {error && (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="lg:hidden">
            {payActions("checkout-pay-mobile")}
          </div>
        </div>

        {/* Récapitulatif : en premier sur mobile, à droite sur bureau. */}
        <aside className="order-1 lg:sticky lg:top-24 lg:order-2 lg:self-start">
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
            {optionDraft.payload.length > 0 && optionDraft.amountCents > 0 ? (
              <p className="mt-3 flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{t("options")}</span>
                <span className="font-medium tabular-nums">
                  {formatPrice(optionDraft.amountCents, `${locale}-CH`)}
                </span>
              </p>
            ) : null}
            <dl className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{tc("subtotal")}</dt>
                <dd>{formatPrice(subtotalCents, `${locale}-CH`)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <dt>{tc("total")}</dt>
                <dd>{formatPrice(total, `${locale}-CH`)}</dd>
              </div>
            </dl>
            <div className="hidden lg:block">{payActions("checkout-pay")}</div>
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
        onFocus={(e) => {
          if (!isStackedLayout()) return;
          e.currentTarget.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }}
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
