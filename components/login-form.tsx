"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { Logo } from "./brand";
import { SpinnerIcon } from "./icons";

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const supabase = getSupabase();
    if (mode === "signIn") {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setMessage({ kind: "error", text: error.message });
      else {
        router.push(next);
        router.refresh();
        return;
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (error) setMessage({ kind: "error", text: error.message });
      else if (data.session) {
        router.push(next);
        router.refresh();
        return;
      } else setMessage({ kind: "info", text: t("auth.checkEmail") });
    }
    setBusy(false);
  }

  async function google() {
    await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  async function guest() {
    setBusy(true);
    const { error } = await getSupabase().auth.signInAnonymously();
    if (error) {
      setMessage({ kind: "error", text: error.message });
      setBusy(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <div className="aurora" />
      <div className="relative z-10 w-full max-w-sm">
        <Link href="/" className="mb-8 flex justify-center">
          <Logo />
        </Link>
        <div className="rounded-3xl border border-line bg-white p-7 shadow-float">
          <h1 className="text-xl font-bold">{t("auth.title")}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t("auth.subtitle")}</p>

          <button onClick={google} className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-xl border border-line py-2.5 text-sm font-medium hover:bg-canvas">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            {t("auth.google")}
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-ink-muted">
            <span className="h-px flex-1 bg-line" /> {t("auth.or")} <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3">
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.email")} dir="ltr" className="rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand-300" />
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.password")}
              dir="ltr"
              className="rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand-300"
            />
            <button disabled={busy} className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-brand-500 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
              {busy && <SpinnerIcon size={16} />}
              {mode === "signIn" ? t("auth.signIn") : t("auth.signUp")}
            </button>
          </form>
          {message && <p className={`mt-3 text-sm ${message.kind === "error" ? "text-red-600" : "text-emerald-700"}`}>{message.text}</p>}

          <p className="mt-5 text-center text-sm text-ink-soft">
            {mode === "signIn" ? t("auth.noAccount") : t("auth.haveAccount")}{" "}
            <button onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")} className="font-medium text-brand-600 hover:underline">
              {mode === "signIn" ? t("auth.signUp") : t("auth.signIn")}
            </button>
          </p>
        </div>
        <button onClick={guest} disabled={busy} className="mx-auto mt-5 block text-sm text-ink-soft hover:text-ink">
          {t("auth.guest")} →
        </button>
      </div>
    </div>
  );
}
