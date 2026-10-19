import { cookies, headers } from "next/headers";
import type { Locale } from "@/lib/types";
import { isLocale, LOCALE_COOKIE } from "./locale";
import { dictionaries, translate, type MessageKey } from "./dictionaries";

export async function getLocale(): Promise<Locale> {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  const accept = (await headers()).get("accept-language") ?? "";
  return /^(he|iw)\b/i.test(accept.trim()) ? "he" : "en";
}

export async function getT() {
  const locale = await getLocale();
  const dict = dictionaries[locale];
  return { locale, t: (key: MessageKey, vars?: Record<string, string | number>) => translate(dict, key, vars) };
}
