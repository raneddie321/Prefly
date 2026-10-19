"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import type { Locale } from "@/lib/types";
import { useAuth } from "./auth-provider";
import { CheckIcon, GlobeIcon, LogOutIcon, SpinnerIcon } from "./icons";

export function Settings() {
  const { t, locale, setLocale } = useI18n();
  const { user, isGuest, configured } = useAuth();
  const router = useRouter();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-20 sm:px-8 lg:pt-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{t("settings.title")}</h1>

      <section className="mt-8 rounded-3xl border border-line bg-white p-6 shadow-card">
        <h2 className="flex items-center gap-2 font-semibold">
          <GlobeIcon size={18} /> {t("settings.language")}
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {([
            ["en", "English"],
            ["he", "עברית"],
          ] as [Locale, string][]).map(([code, label]) => (
            <button
              key={code}
              onClick={() => setLocale(code)}
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-start transition ${
                locale === code ? "border-brand-400 bg-brand-50 text-brand-700" : "border-line hover:border-brand-200"
              }`}
            >
              <span className="font-medium">{label}</span>
              {locale === code && <CheckIcon size={18} />}
            </button>
          ))}
        </div>
      </section>

      {configured && (
        <section className="mt-6 rounded-3xl border border-line bg-white p-6 shadow-card">
          <h2 className="font-semibold">{t("settings.account")}</h2>
          {!user ? (
            <div className="mt-4 flex items-center justify-between gap-4">
              <p className="text-sm text-ink-soft">{t("settings.notSignedIn")}</p>
              <Link href="/login" className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
                {t("nav.signIn")}
              </Link>
            </div>
          ) : (
            <>
              {isGuest ? <UpgradeGuest /> : <AccountDetails email={user.email ?? ""} />}
              <button
                onClick={async () => {
                  await getSupabase().auth.signOut();
                  router.push("/");
                  router.refresh();
                }}
                className="mt-6 flex items-center gap-2 text-sm text-ink-soft hover:text-ink"
              >
                <LogOutIcon size={16} /> {t("settings.signOut")}
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function AccountDetails({ email }: { email: string }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    getSupabase()
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle<{ display_name: string | null }>()
      .then(({ data }) => setName(data?.display_name ?? ""));
  }, [user]);

  async function save() {
    if (!user) return;
    await getSupabase().from("profiles").upsert({ id: user.id, display_name: name.trim().slice(0, 40) || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <p className="text-sm text-ink-soft">{t("settings.signedInAs", { email })}</p>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{t("settings.displayName")}</span>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="flex-1 rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand-300" />
          <button onClick={save} className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-600">
            {saved && <CheckIcon size={15} />}
            {saved ? t("settings.saved") : t("settings.save")}
          </button>
        </div>
      </label>
    </div>
  );
}

function UpgradeGuest() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "busy" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    // Linking an email keeps the guest's user id, so all their games stay with them.
    const { error: err } = await getSupabase().auth.updateUser(
      { email: email.trim(), password: password || undefined },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings` },
    );
    if (err) {
      setError(err.message);
      setStatus("error");
    } else setStatus("sent");
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
      <p className="rounded-2xl bg-brand-50 px-4 py-3 text-sm text-brand-800">{t("settings.guestNotice")}</p>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("settings.email")} className="rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand-300" dir="ltr" />
      <input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t("settings.password")} className="rounded-xl border border-line px-3 py-2.5 text-sm outline-none focus:border-brand-300" dir="ltr" />
      <button disabled={status === "busy"} className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-60">
        {status === "busy" && <SpinnerIcon size={16} />}
        {t("settings.saveEmail")}
      </button>
      {status === "sent" && <p className="text-sm text-emerald-700">{t("settings.emailSent")}</p>}
      {status === "error" && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
