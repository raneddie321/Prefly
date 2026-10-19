"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@/lib/types";
import { dictionaries, translate, type MessageKey } from "./dictionaries";
import { dirOf, LOCALE_COOKIE } from "./locale";

interface I18nValue {
  locale: Locale;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(dictionaries[locale], key, vars),
    [locale],
  );
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      document.documentElement.dir = dirOf(next);
      router.refresh();
    },
    [router],
  );
  const value = useMemo(() => ({ locale, t, setLocale }), [locale, t, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}

export function useRelativeTime() {
  const { locale, t } = useI18n();
  return useCallback(
    (iso: string) => {
      const diff = (new Date(iso).getTime() - Date.now()) / 1000;
      const abs = Math.abs(diff);
      if (abs < 45) return t("common.justNow");
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      const units: [Intl.RelativeTimeFormatUnit, number][] = [
        ["minute", 60],
        ["hour", 3600],
        ["day", 86400],
        ["week", 604800],
        ["month", 2592000],
        ["year", 31536000],
      ];
      let chosen = units[0];
      for (const u of units) if (abs >= u[1]) chosen = u;
      return rtf.format(Math.round(diff / chosen[1]), chosen[0]);
    },
    [locale, t],
  );
}
