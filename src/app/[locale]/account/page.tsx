"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Ticket, Receipt, UserRound, LogIn, Mail, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

type Tab = "tickets" | "orders" | "profile";

export default function AccountPage() {
  const t = useTranslations("account");
  const [signedIn, setSignedIn] = React.useState(false);
  const [tab, setTab] = React.useState<Tab>("tickets");
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");

  if (!signedIn) {
    return (
      <div className="container-page max-w-md py-16">
        <div className="rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="mb-6 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10">
              <UserRound className="size-7 text-primary" />
            </div>
            <h1 className="mt-4 text-2xl font-bold">
              {mode === "signin" ? t("signIn") : t("signUp")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("loginToContinue")}
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSignedIn(true);
            }}
            className="space-y-4"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("email")}</span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-ring"
                />
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("password")}</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  required
                  className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm outline-none focus:border-ring"
                />
              </div>
            </label>
            <Button type="submit" size="lg" className="w-full">
              <LogIn className="size-4" />
              {mode === "signin" ? t("signIn") : t("signUp")}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-muted-foreground">
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="font-medium text-primary hover:underline"
            >
              {mode === "signin" ? t("signUp") : t("signIn")}
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-muted-foreground">
            {t("welcome")}
            {email ? `, ${email}` : ""}
          </p>
        </div>
        <Button variant="outline" onClick={() => setSignedIn(false)}>
          {t("signOut")}
        </Button>
      </div>

      <div className="mt-8 flex gap-2 border-b border-border">
        <TabButton
          active={tab === "tickets"}
          onClick={() => setTab("tickets")}
          icon={<Ticket className="size-4" />}
          label={t("myTickets")}
        />
        <TabButton
          active={tab === "orders"}
          onClick={() => setTab("orders")}
          icon={<Receipt className="size-4" />}
          label={t("myOrders")}
        />
        <TabButton
          active={tab === "profile"}
          onClick={() => setTab("profile")}
          icon={<UserRound className="size-4" />}
          label={t("profile")}
        />
      </div>

      <div className="mt-8">
        {tab === "tickets" && (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <Ticket className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">{t("noTickets")}</p>
          </div>
        )}
        {tab === "orders" && (
          <div className="rounded-2xl border border-dashed border-border py-16 text-center">
            <Receipt className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-muted-foreground">—</p>
          </div>
        )}
        {tab === "profile" && (
          <div className="max-w-md rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted-foreground">{t("email")}</p>
            <p className="font-medium">{email || "—"}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
