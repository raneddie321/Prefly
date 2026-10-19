"use client";

import { ensureUser, getSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { localStore } from "@/lib/local-store";
import { buildTemplateGame, type TemplateId } from "@/lib/templates";
import { PROJECT_SUMMARY_COLUMNS, type AssetMap, type GameMode, type Locale, type Project, type ProjectMessage, type ProjectSummary, type ProjectVersion } from "@/lib/types";

/**
 * Client data access. Uses Supabase when it's configured, otherwise the
 * browser's localStorage, so the app works with zero setup.
 */
export const isLocalMode = () => !isSupabaseConfigured();

type Editable = Partial<Pick<Project, "title" | "html" | "assets" | "is_public" | "published_at" | "author_name">>;

export async function createProject(fields: { title: string; mode: GameMode; multiplayer: boolean }): Promise<string> {
  if (isLocalMode()) return localStore.create(fields).id;
  await ensureUser();
  const { data, error } = await getSupabase().from("projects").insert(fields).select("id").single<{ id: string }>();
  if (error || !data) throw new Error(error?.message ?? "Could not create the game");
  return data.id;
}

export async function listProjects(limit = 200): Promise<ProjectSummary[]> {
  if (isLocalMode()) {
    return localStore.list().slice(0, limit).map((p) => ({ ...p, play_count: 0, author_name: null }));
  }
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data } = await supabase
    .from("projects")
    .select(PROJECT_SUMMARY_COLUMNS)
    .eq("user_id", auth.user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ProjectSummary[];
}

export async function updateProject(id: string, patch: Editable): Promise<boolean> {
  if (isLocalMode()) {
    localStore.update(id, patch);
    return true;
  }
  const { error } = await getSupabase().from("projects").update(patch).eq("id", id);
  return !error;
}

export async function deleteProject(id: string) {
  if (isLocalMode()) return localStore.remove(id);
  await getSupabase().from("projects").delete().eq("id", id);
}

export async function listVersions(projectId: string): Promise<ProjectVersion[]> {
  if (isLocalMode()) {
    return [...(localStore.get(projectId)?.versions ?? [])].reverse().map((v) => ({ id: v.id, project_id: projectId, summary: v.summary, created_at: v.created_at }));
  }
  const { data } = await getSupabase()
    .from("project_versions")
    .select("id,project_id,summary,created_at")
    .eq("project_id", projectId)
    .order("id", { ascending: false })
    .limit(50);
  return (data ?? []) as ProjectVersion[];
}

export async function getVersion(projectId: string, versionId: number): Promise<{ html: string; assets: AssetMap; summary: string } | null> {
  if (isLocalMode()) return localStore.get(projectId)?.versions.find((v) => v.id === versionId) ?? null;
  const { data } = await getSupabase()
    .from("project_versions")
    .select("html,assets,summary")
    .eq("id", versionId)
    .single<{ html: string; assets: AssetMap; summary: string }>();
  return data;
}

export async function addVersion(projectId: string, version: { html: string; assets: AssetMap; summary: string }) {
  if (isLocalMode()) return localStore.addVersion(projectId, version);
  await getSupabase().from("project_versions").insert({ project_id: projectId, ...version });
}

export async function addMessage(projectId: string, message: Pick<ProjectMessage, "role" | "content" | "meta">) {
  if (isLocalMode()) return localStore.addMessage(projectId, message);
  await getSupabase().from("project_messages").insert({ project_id: projectId, ...message });
}

/** Copies a game (yours, a public one, or a built-in demo) into a new project. */
export async function remixProject(sourceId: string, titleSuffix: string, locale: Locale): Promise<string> {
  let source: Pick<Project, "title" | "description" | "emoji" | "palette" | "mode" | "multiplayer" | "plan" | "html" | "assets"> | null = null;
  let remixedFrom: string | null = sourceId;
  if (sourceId.startsWith("demo-")) {
    const { html, plan } = buildTemplateGame(sourceId.slice(5) as TemplateId, locale);
    source = { title: plan.title, description: plan.tagline, emoji: plan.emoji, palette: plan.palette, mode: plan.dimension, multiplayer: false, plan, html, assets: {} };
    remixedFrom = null;
  } else if (isLocalMode()) {
    source = localStore.get(sourceId);
  } else {
    await ensureUser();
    const { data } = await getSupabase()
      .from("projects")
      .select("title,description,emoji,palette,mode,multiplayer,plan,html,assets")
      .eq("id", sourceId)
      .single();
    source = data;
  }
  if (!source) throw new Error("Game not found");

  const fields = {
    title: `${source.title} ${titleSuffix}`.slice(0, 80),
    description: source.description,
    emoji: source.emoji,
    palette: source.palette,
    mode: source.mode,
    multiplayer: source.multiplayer,
    plan: source.plan,
    html: source.html,
    assets: source.assets,
  };
  const summary = `Remix of ${source.title}`;
  if (isLocalMode()) {
    const created = localStore.create(fields);
    if (source.html) localStore.addVersion(created.id, { html: source.html, assets: source.assets, summary });
    return created.id;
  }
  await ensureUser();
  const supabase = getSupabase();
  const { data: created, error } = await supabase
    .from("projects")
    .insert({ ...fields, remixed_from: remixedFrom })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) throw new Error(error?.message ?? "Could not copy the game");
  if (source.html) await supabase.from("project_versions").insert({ project_id: created.id, html: source.html, assets: source.assets, summary });
  return created.id;
}
