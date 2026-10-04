import { createSignal } from "solid-js";
import englishCatalog from "./locales/en.yaml";
import vietnameseCatalog from "./locales/vi.yaml";

export type Locale = "en" | "vi";
type Catalog = {
  language: string;
  code: Locale;
  messages: Record<string, string>;
};
const catalogs = [englishCatalog, vietnameseCatalog] as Catalog[];
const defaultCatalog = catalogs[0];
export type MessageKey = keyof typeof defaultCatalog.messages;
export const availableLocales = catalogs.map(({ code, language }) => ({
  code,
  language,
}));

const stored =
  typeof window === "undefined"
    ? null
    : window.localStorage.getItem("plasain.locale");
const [locale, setLocaleSignal] = createSignal<Locale>(
  stored === "en" ? "en" : "vi",
);
export { locale };

export function setLocale(next: Locale) {
  setLocaleSignal(next);
  if (typeof window !== "undefined")
    window.localStorage.setItem("plasain.locale", next);
}

export function t(key: MessageKey) {
  return (
    catalogs.find((catalog) => catalog.code === locale())?.messages[key] ??
    defaultCatalog.messages[key] ??
    key
  );
}
