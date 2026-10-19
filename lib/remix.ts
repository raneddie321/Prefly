"use client";

import { ensureUser, getSupabase } from "@/lib/supabase/client";
import type { Project } from "@/lib/types";

/** Copies a game (yours or a public one) into a new project owned by the current user. */
export async function remixProject(sourceId: string, titleSuffix: string): Promise<string> {
  await ensureUser();
  const supabase = getSupabase();
  const { data: source, error } = await supabase
    .from("projects")
    .select("id,title,description,emoji,palette,mode,multiplayer,plan,html,assets")
    .eq("id", sourceId)
    .single<Pick<Project, "id" | "title" | "description" | "emoji" | "palette" | "mode" | "multiplayer" | "plan" | "html" | "assets">>();
  if (error || !source) throw new Error(error?.message ?? "Game not found");

  const { data: created, error: insertError } = await supabase
    .from("projects")
    .insert({
      title: `${source.title} ${titleSuffix}`.slice(0, 80),
      description: source.description,
      emoji: source.emoji,
      palette: source.palette,
      mode: source.mode,
      multiplayer: source.multiplayer,
      plan: source.plan,
      html: source.html,
      assets: source.assets,
      remixed_from: source.id,
    })
    .select("id")
    .single<{ id: string }>();
  if (insertError || !created) throw new Error(insertError?.message ?? "Could not copy the game");
  if (source.html) {
    await supabase.from("project_versions").insert({ project_id: created.id, html: source.html, assets: source.assets, summary: `Remix of ${source.title}` });
  }
  return created.id;
}
