"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { PLAN_LIMITS } from "@/lib/plans";
import type { MessageKey } from "@/lib/i18n/dictionaries";
import { useAuth } from "./auth-provider";
import { CheckIcon, SparklesIcon, SpinnerIcon } from "./icons";

export async function openBilling(kind: "checkout" | "portal"): Promise<string | null> {
  const res = await fetch(`/api/billing/${kind}`, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string; code?: string };
  if (body.url) {
    window.location.href = body.url;
    return null;
  }
  if (body.code === "account") window.location.href = "/login?next=/pricing";
  return body.error ?? "Something went wrong";
}

export function Pricing() {
  const { t } = useI18n();
  const { plan, billingEnabled, configured } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const free: MessageKey[] = ["pricing.free.f1", "pricing.free.f2", "pricing.free.f3", "pricing.free.f4", "pricing.free.f5"];
  const pro: MessageKey[] = ["pricing.pro.f1", "pricing.pro.f2", "pricing.pro.f3", "pricing.pro.f4", "pricing.pro.f5", "pricing.pro.f6"];

  async function upgrade() {
    setBusy(true);
    setError(await openBilling(plan === "pro" ? "portal" : "checkout"));
    setBusy(false);
  }

  return (
    <div className="relative min-h-dvh overflow-hidden px-4 pb-20 pt-20 sm:px-8 lg:pt-14">
      <div className="aurora" />
      <div className="relative z-10 mx-auto max-w-5xl">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-600">
            <SparklesIcon size={13} /> Prefly Pro
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">{t("pricing.title")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-soft">{t("pricing.subtitle")}</p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="rounded-[28px] border border-line bg-white/90 p-8 shadow-card backdrop-blur">
            <h2 className="text-lg font-bold">{t("pricing.free")}</h2>
            <p className="mt-1 text-sm text-ink-soft">{t("pricing.free.desc")}</p>
            <p className="mt-6 text-4xl font-extrabold">
              $0<span className="text-base font-medium text-ink-muted"> / {t("pricing.month")}</span>
            </p>
            <ul className="mt-6 flex flex-col gap-3 text-sm">
              {free.map((k) => (
                <li key={k} className="flex gap-2.5">
                  <CheckIcon size={18} className="shrink-0 text-emerald-500" /> {t(k, { n: PLAN_LIMITS.free.daily, g: PLAN_LIMITS.guest.daily })}
                </li>
              ))}
            </ul>
            <Link href="/" className="mt-8 block rounded-2xl border border-line py-3 text-center font-medium hover:bg-canvas">
              {plan === "free" || plan === "guest" ? t("pricing.current") : t("pricing.start")}
            </Link>
          </div>

          <div className="relative rounded-[28px] bg-gradient-to-br from-brand-500 via-violet-500 to-fuchsia-500 p-[2px] shadow-float">
            <div className="h-full rounded-[26px] bg-white p-8">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{t("pricing.pro")}</h2>
                <span className="rounded-full bg-gradient-to-r from-brand-500 to-fuchsia-500 px-2.5 py-1 text-xs font-bold text-white">{t("pricing.popular")}</span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">{t("pricing.pro.desc")}</p>
              <p className="mt-6 text-4xl font-extrabold">
                {process.env.NEXT_PUBLIC_PRO_PRICE ?? "$12"}<span className="text-base font-medium text-ink-muted"> / {t("pricing.month")}</span>
              </p>
              <ul className="mt-6 flex flex-col gap-3 text-sm">
                {pro.map((k) => (
                  <li key={k} className="flex gap-2.5">
                    <CheckIcon size={18} className="shrink-0 text-brand-500" /> {t(k, { n: PLAN_LIMITS.pro.daily })}
                  </li>
                ))}
              </ul>
              {billingEnabled ? (
                <button
                  onClick={upgrade}
                  disabled={busy}
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-fuchsia-500 py-3 font-semibold text-white shadow-lg shadow-brand-500/30 transition hover:opacity-95 disabled:opacity-60"
                >
                  {busy && <SpinnerIcon size={18} />}
                  {plan === "pro" ? t("pricing.manage") : t("pricing.upgrade")}
                </button>
              ) : (
                <p className="mt-8 rounded-2xl bg-canvas py-3 text-center text-sm text-ink-soft">{configured ? t("pricing.soon") : t("pricing.needsDb")}</p>
              )}
              {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            </div>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-ink-muted">{t("pricing.note")}</p>
      </div>
    </div>
  );
}
