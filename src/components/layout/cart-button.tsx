"use client";

import * as React from "react";
import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CartPreview } from "@/components/cart/cart-preview";
import { useCart } from "@/components/cart/cart-context";

function canHoverFine() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function CartButton({
  panelOffsetClass = "top-[4.25rem]",
}: {
  /** Décalage du panneau mobile sous un en-tête plus haut (page /go). */
  panelOffsetClass?: string;
}) {
  const t = useTranslations("nav");
  const { count, addedRevision } = useCart();
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const prevAdded = React.useRef(0);
  const ignoreOutsideUntil = React.useRef(0);
  const leaveTimer = React.useRef<number>(0);

  function openPinned() {
    ignoreOutsideUntil.current = Date.now() + 400;
    setOpen(true);
  }

  React.useEffect(() => {
    if (addedRevision > 0 && addedRevision !== prevAdded.current) {
      prevAdded.current = addedRevision;
      openPinned();
    }
  }, [addedRevision]);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: PointerEvent) {
      if (Date.now() < ignoreOutsideUntil.current) return;
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  React.useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  function onMouseEnter() {
    if (!canHoverFine()) return;
    window.clearTimeout(leaveTimer.current);
    setOpen(true);
  }

  function onMouseLeave() {
    if (!canHoverFine()) return;
    if (Date.now() < ignoreOutsideUntil.current) return;
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setOpen(false), 220);
  }

  function onTriggerClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (canHoverFine()) return;
    e.preventDefault();
    setOpen((v) => !v);
  }

  return (
    <div className="relative z-50">
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-foreground/25 md:hidden"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      ) : null}
      <div
        ref={wrapRef}
        className="relative"
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <Link
          href="/cart"
          aria-label={t("cart")}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={onTriggerClick}
          className="relative inline-flex size-10 items-center justify-center rounded-full transition-colors hover:bg-secondary/70"
        >
          <ShoppingBag className="size-5" />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
              {count}
            </span>
          )}
        </Link>

        {open ? (
          <div
            role="dialog"
            aria-label={t("cart")}
            className={`fixed inset-x-3 z-50 ${panelOffsetClass} md:absolute md:inset-x-auto md:right-0 md:top-full md:w-[28rem] md:pt-2`}
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl">
              <CartPreview onNavigate={() => setOpen(false)} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
