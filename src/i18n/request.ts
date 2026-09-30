import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

type Messages = Record<string, unknown>;

const isGroup = (v: unknown): v is Messages =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function merge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const current = out[key];
    out[key] = isGroup(value) && isGroup(current) ? merge(current, value) : value;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const messages: Messages = (await import(`../../messages/${locale}.json`))
    .default;

  // es.json ne traduit que le parcours d'achat : le reste retombe sur l'anglais.
  return {
    locale,
    messages:
      locale === "es"
        ? merge((await import("../../messages/en.json")).default, messages)
        : messages,
  };
});
