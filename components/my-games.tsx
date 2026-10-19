"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n, useRelativeTime } from "@/lib/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { remixProject } from "@/lib/remix";
import { PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from "@/lib/types";
import { useAuth } from "./auth-provider";
import { GameCard } from "./game-card";
import { CopyIcon, DotsIcon, GlobeIcon, LockIcon, PlusIcon, SpinnerIcon, TrashIcon } from "./icons";

export function MyGames() {
  const { t } = useI18n();
  const relative = useRelativeTime();
  const router = useRouter();
  const { user, loading: authLoading, refreshRecent } = useAuth();
  const [games, setGames] = useState<ProjectSummary[] | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setGames([]);
      return;
    }
    const { data } = await getSupabase()
      .from("projects")
      .select(PROJECT_SUMMARY_COLUMNS)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    setGames((data ?? []) as ProjectSummary[]);
  }, [user]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  async function remove(game: ProjectSummary) {
    if (!window.confirm(t("games.confirmDelete", { title: game.title }))) return;
    await getSupabase().from("projects").delete().eq("id", game.id);
    setGames((g) => g?.filter((x) => x.id !== game.id) ?? null);
    void refreshRecent();
  }

  async function duplicate(game: ProjectSummary) {
    const id = await remixProject(game.id, "(2)");
    void refreshRecent();
    router.push(`/project/${id}`);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-8 lg:pt-12">
      <div className="flex items-end justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">{t("games.title")}</h1>
        <Link href="/" className="flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-brand-500/30 hover:bg-brand-600">
          <PlusIcon size={18} /> {t("nav.newGame")}
        </Link>
      </div>

      {games === null ? (
        <div className="flex justify-center py-24 text-ink-muted">
          <SpinnerIcon size={28} />
        </div>
      ) : games.length === 0 ? (
        <div className="mt-10 flex flex-col items-center rounded-3xl border border-dashed border-line bg-white/60 px-6 py-20 text-center">
          <span className="text-5xl">🎮</span>
          <p className="mt-4 text-ink-soft">{t("games.empty")}</p>
          <Link href="/" className="mt-6 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600">
            {t("games.createFirst")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {games.map((g) => (
            <GameCard
              key={g.id}
              href={`/project/${g.id}`}
              title={g.title}
              description={g.description}
              emoji={g.emoji}
              palette={g.palette}
              meta={t("games.edited", { time: relative(g.updated_at) })}
              badge={
                <span className="flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-ink-soft backdrop-blur">
                  {g.is_public ? <GlobeIcon size={12} /> : <LockIcon size={12} />}
                  {g.is_public ? t("games.public") : t("games.private")}
                </span>
              }
              actions={<CardMenu onDelete={() => remove(g)} onDuplicate={() => duplicate(g)} />}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CardMenu({ onDelete, onDuplicate }: { onDelete: () => void; onDuplicate: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-ink-muted hover:bg-black/5 hover:text-ink" aria-label="More">
        <DotsIcon size={18} />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-10 mt-1 w-40 animate-fade-in rounded-xl border border-line bg-white p-1 shadow-float">
          <button onClick={() => { setOpen(false); onDuplicate(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-canvas">
            <CopyIcon size={15} /> {t("games.duplicate")}
          </button>
          <button onClick={() => { setOpen(false); onDelete(); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            <TrashIcon size={15} /> {t("games.delete")}
          </button>
        </div>
      )}
    </div>
  );
}
