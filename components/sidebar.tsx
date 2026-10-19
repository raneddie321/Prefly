"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { useAuth } from "./auth-provider";
import { Logo } from "./brand";
import { ChevronRightIcon, FolderIcon, MenuIcon, PlusIcon, SettingsIcon, UsersIcon, XIcon } from "./icons";

export function Sidebar() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { user, isGuest, recent, configured } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Close the mobile drawer after navigating.
    setOpen(false);
  }, [pathname]);

  const nav = [
    { href: "/", label: t("nav.newGame"), icon: PlusIcon, primary: true, active: pathname === "/" },
    { href: "/games", label: t("nav.myGames"), icon: FolderIcon, active: pathname.startsWith("/games") },
    { href: "/community", label: t("nav.community"), icon: UsersIcon, active: pathname.startsWith("/community") },
  ];

  const accountLabel = !user ? t("nav.signIn") : isGuest ? t("nav.guest") : (user.email ?? t("nav.guest"));

  const content = (
    <div className="flex h-full flex-col px-4 pb-5 pt-6">
      <div className="flex items-center justify-between px-3">
        <Link href="/" aria-label="Prefly">
          <Logo />
        </Link>
        <button className="rounded-lg p-2 text-ink-soft hover:bg-black/5 lg:hidden" onClick={() => setOpen(false)} aria-label="Close">
          <XIcon />
        </button>
      </div>

      <nav className="mt-9 flex flex-col gap-1.5">
        {nav.map(({ href, label, icon: Icon, primary, active }) => (
          <Link
            key={href}
            href={href}
            className={`group flex items-center gap-3.5 rounded-2xl px-3 py-3 text-[0.95rem] transition ${
              active ? "bg-brand-50 font-medium text-brand-600" : "text-ink hover:bg-black/[0.035]"
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                primary ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30" : active ? "text-brand-600" : "text-ink-soft"
              }`}
            >
              <Icon size={primary ? 18 : 22} />
            </span>
            {label}
          </Link>
        ))}
      </nav>

      {recent.length > 0 && (
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">{t("nav.recent")}</p>
          <ul className="flex flex-col">
            {recent.map((p) => {
              const active = pathname === `/project/${p.id}`;
              return (
                <li key={p.id}>
                  <Link
                    href={`/project/${p.id}`}
                    className={`flex items-center gap-2.5 truncate rounded-xl px-3 py-2 text-sm transition ${
                      active ? "bg-black/[0.05] text-ink" : "text-ink-soft hover:bg-black/[0.035] hover:text-ink"
                    }`}
                  >
                    <span className="text-base leading-none">{p.emoji}</span>
                    <span className="truncate">{p.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {recent.length === 0 && <div className="flex-1" />}

      <div className="mt-4 flex flex-col gap-2">
        <Link
          href="/settings"
          className={`flex items-center gap-3.5 rounded-2xl px-3 py-3 text-[0.95rem] transition ${
            pathname.startsWith("/settings") ? "bg-brand-50 font-medium text-brand-600" : "text-ink hover:bg-black/[0.035]"
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center text-ink-soft">
            <SettingsIcon size={22} />
          </span>
          {t("nav.settings")}
        </Link>
        {configured && (
          <Link
            href={user ? "/settings" : "/login"}
            className="flex items-center gap-3 rounded-2xl border border-line bg-white px-3 py-3 shadow-card transition hover:border-brand-200"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#7a7a8c] to-[#4d4d5e] text-white">
              {user && !isGuest && user.email ? (
                <span className="text-sm font-semibold uppercase">{user.email[0]}</span>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="9" r="4" />
                  <path d="M4.5 20c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5z" />
                </svg>
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[0.95rem] font-medium">{accountLabel}</span>
            <ChevronRightIcon size={18} className="shrink-0 text-ink-soft rtl:rotate-180" />
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <>
      <button
        className="fixed start-3 top-3 z-40 rounded-xl border border-line bg-white/90 p-2.5 shadow-card backdrop-blur lg:hidden"
        onClick={() => setOpen(true)}
        aria-label={t("nav.menu")}
      >
        <MenuIcon />
      </button>
      <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 border-e border-line bg-white/70 backdrop-blur lg:block">{content}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-[min(300px,85vw)] animate-fade-in bg-white shadow-float">{content}</aside>
        </div>
      )}
    </>
  );
}
