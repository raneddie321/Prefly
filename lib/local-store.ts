"use client";

import type { AssetMap, GameMode, GamePlan, ProjectMessage } from "@/lib/types";

/**
 * Projects stored in the browser's localStorage. Used when the site runs
 * without Supabase, so everything still works on a single device.
 */

export interface LocalVersion {
  id: number;
  html: string;
  files?: Record<string, string> | null;
  assets: AssetMap;
  summary: string;
  created_at: string;
}

export interface LocalProject {
  id: string;
  title: string;
  description: string;
  emoji: string;
  palette: string[];
  mode: GameMode;
  multiplayer: boolean;
  plan: GamePlan | null;
  html: string | null;
  files: Record<string, string> | null;
  assets: AssetMap;
  is_public: boolean;
  created_at: string;
  updated_at: string;
  messages: ProjectMessage[];
  versions: LocalVersion[];
}

const KEY = "prefly:projects:v1";
const MAX_VERSIONS = 15;

function readAll(): Record<string, LocalProject> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, LocalProject>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Storage full: drop the oldest versions everywhere and try once more.
    for (const p of Object.values(all)) p.versions = p.versions.slice(-3);
    localStorage.setItem(KEY, JSON.stringify(all));
  }
}

export const localStore = {
  list(): LocalProject[] {
    return Object.values(readAll()).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  },
  get(id: string): LocalProject | null {
    return readAll()[id] ?? null;
  },
  create(fields: Partial<LocalProject>): LocalProject {
    const now = new Date().toISOString();
    const project: LocalProject = {
      id: crypto.randomUUID(),
      title: "Untitled game",
      description: "",
      emoji: "🎮",
      palette: ["#6d5dfc", "#a78bfa"],
      mode: "auto",
      multiplayer: false,
      plan: null,
      html: null,
      files: null,
      assets: {},
      is_public: false,
      created_at: now,
      updated_at: now,
      messages: [],
      versions: [],
      ...fields,
    };
    const all = readAll();
    all[project.id] = project;
    writeAll(all);
    return project;
  },
  update(id: string, patch: Partial<LocalProject>) {
    const all = readAll();
    if (!all[id]) return;
    all[id] = { ...all[id], ...patch, updated_at: new Date().toISOString() };
    writeAll(all);
  },
  remove(id: string) {
    const all = readAll();
    delete all[id];
    writeAll(all);
  },
  addMessage(id: string, message: Pick<ProjectMessage, "role" | "content" | "meta">) {
    const all = readAll();
    const p = all[id];
    if (!p) return;
    const nextId = (p.messages.at(-1)?.id ?? 0) + 1;
    p.messages.push({ id: nextId, project_id: id, created_at: new Date().toISOString(), ...message });
    writeAll(all);
  },
  addVersion(id: string, version: Pick<LocalVersion, "html" | "files" | "assets" | "summary">) {
    const all = readAll();
    const p = all[id];
    if (!p) return;
    const nextId = (p.versions.at(-1)?.id ?? 0) + 1;
    p.versions = [...p.versions, { id: nextId, created_at: new Date().toISOString(), ...version }].slice(-MAX_VERSIONS);
    writeAll(all);
  },
};
