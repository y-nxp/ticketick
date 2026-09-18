"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  getCheckoutOptions,
  type CheckoutOption,
} from "@/lib/data/checkout-options";
import type { OptionSelectionInput } from "@/lib/orders/option-types";
import { formatPrice } from "@/lib/utils";

export type OptionDraft = {
  payload: OptionSelectionInput[];
  amountCents: number;
};

export function EventOptions({
  sessionIds,
  locale,
  onChange,
}: {
  sessionIds: string[];
  locale: string;
  onChange: (draft: OptionDraft) => void;
}) {
  const t = useTranslations("checkout");
  const sessionKey = [...sessionIds].sort().join(",");
  const [options, setOptions] = React.useState<CheckoutOption[]>([]);
  const [wanted, setWanted] = React.useState<Record<string, boolean>>({});
  const [picks, setPicks] = React.useState<Record<string, Record<string, string>>>(
    {},
  );

  React.useEffect(() => {
    let ignore = false;
    if (!sessionKey) return;
    getCheckoutOptions(sessionKey.split(","), locale).then((next) => {
      if (ignore) return;
      setOptions(next);
    });
    return () => {
      ignore = true;
    };
  }, [sessionKey, locale]);

  function emit(
    nextWanted: Record<string, boolean>,
    nextPicks: Record<string, Record<string, string>>,
  ) {
    onChange(buildDraft(options, nextWanted, nextPicks));
  }

  if (options.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{t("options")}</h2>
      <div className="mt-4 space-y-5">
        {options.map((option) => {
          const on = wanted[option.id] === true;
          return (
            <div key={option.id} className="space-y-3">
              <label className="flex items-start gap-3 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => {
                    const next = {
                      ...wanted,
                      [option.id]: e.target.checked,
                    };
                    setWanted(next);
                    emit(next, picks);
                  }}
                  className="mt-0.5 size-4 rounded border-border accent-[var(--primary)]"
                />
                <span>{option.title}</span>
              </label>

              {on ? (
                <div className="space-y-4 border-l-2 border-primary/30 pl-4">
                  {option.hint ? (
                    <p className="text-sm text-muted-foreground">{option.hint}</p>
                  ) : null}
                  {option.groups.map((group) => (
                    <fieldset key={group.id} className="space-y-2">
                      <legend className="text-sm font-medium">{group.title}</legend>
                      {group.choices.map((choice) => (
                        <label
                          key={choice.id}
                          className="flex items-center gap-2.5 text-sm"
                        >
                          <input
                            type="radio"
                            name={`option-${option.id}-${group.id}`}
                            value={choice.id}
                            checked={picks[option.id]?.[group.id] === choice.id}
                            onChange={() => {
                              const next = {
                                ...picks,
                                [option.id]: {
                                  ...(picks[option.id] ?? {}),
                                  [group.id]: choice.id,
                                },
                              };
                              setPicks(next);
                              emit(wanted, next);
                            }}
                            className="size-4 border-border accent-[var(--primary)]"
                          />
                          {choice.label}
                        </label>
                      ))}
                    </fieldset>
                  ))}
                  {option.priceCents > 0 ? (
                    <p className="text-sm font-medium tabular-nums">
                      {formatPrice(
                        optionAmount(option, picks[option.id] ?? {}),
                        `${locale}-CH`,
                      )}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function optionAmount(
  option: CheckoutOption,
  picks: Record<string, string>,
): number {
  const n = Object.values(picks).filter(Boolean).length;
  if (option.priceMode === "PER_CHOICE") return option.priceCents * n;
  return option.priceCents;
}

function buildDraft(
  options: CheckoutOption[],
  wanted: Record<string, boolean>,
  picks: Record<string, Record<string, string>>,
): OptionDraft {
  const payload: OptionSelectionInput[] = [];
  let amountCents = 0;
  for (const option of options) {
    if (!wanted[option.id]) continue;
    const choiceIds = Object.values(picks[option.id] ?? {}).filter(Boolean);
    payload.push({ optionId: option.id, choiceIds });
    amountCents += optionAmount(option, picks[option.id] ?? {});
  }
  return { payload, amountCents };
}
