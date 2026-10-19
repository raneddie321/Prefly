import type { Locale } from "@/lib/types";

export const LOCALE_COOKIE = "prefly-locale";
export const LOCALES: Locale[] = ["en", "he"];

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "he";
}

export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "he" ? "rtl" : "ltr";
}
