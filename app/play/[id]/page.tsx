import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getT } from "@/lib/i18n/server";
import { PlayView } from "@/components/play-view";
import type { Project } from "@/lib/types";

type PlayProject = Pick<Project, "id" | "user_id" | "title" | "description" | "emoji" | "palette" | "html" | "assets" | "is_public" | "author_name" | "play_count" | "multiplayer">;

async function load(id: string): Promise<PlayProject | null> {
  if (!isSupabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("id,user_id,title,description,emoji,palette,html,assets,is_public,author_name,play_count,multiplayer")
    .eq("id", id)
    .maybeSingle<PlayProject>();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const game = await load(id);
  if (!game) return { title: "Game not found" };
  return {
    title: game.title,
    description: game.description || "A game made with Prefly",
    openGraph: { title: `${game.emoji} ${game.title}`, description: game.description || "Play this game made with Prefly AI." },
  };
}

export default async function PlayPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ room?: string }> }) {
  const { id } = await params;
  const { room } = await searchParams;
  const game = await load(id);
  const { t } = await getT();
  if (!game || !game.html) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
          <p className="text-ink-soft">{t("studio.notFound")}</p>
          <Link href="/" className="mt-5 inline-block rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white">
            {t("play.makeYourOwn")}
          </Link>
        </div>
      </div>
    );
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <PlayView game={game} room={room?.replace(/[^a-z0-9]/gi, "").slice(0, 12) || null} isOwner={user?.id === game.user_id} />;
}
