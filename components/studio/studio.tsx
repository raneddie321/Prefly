"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { clearGeneration, startGeneration, stopGeneration, takePendingPrompt, useGeneration, type StartOptions } from "@/lib/generation-store";
import { streamingCode } from "@/lib/ai/response";
import type { AssetMap, ImageInput, Project, ProjectMessage, RuntimeError } from "@/lib/types";
import { useAuth } from "../auth-provider";
import { ChatIcon, ChevronLeftIcon, DownloadIcon, GlobeIcon, HistoryIcon, PlayIcon, ShareIcon } from "../icons";
import { ChatPanel, type ChatMessage } from "./chat-panel";
import { PreviewPanel } from "./preview-panel";
import { GameTester } from "./game-tester";
import { DownloadDialog, ShareDialog, VersionsDialog } from "./dialogs";
import type { TestStatus } from "./agent-progress";

export type StudioProject = Pick<
  Project,
  "id" | "title" | "description" | "emoji" | "palette" | "html" | "assets" | "is_public" | "multiplayer" | "plan"
>;

const MAX_AUTO_FIX_ROUNDS = 2;
const startedPending = new Set<string>();

function toChat(m: Pick<ProjectMessage, "id" | "role" | "content" | "meta">): ChatMessage {
  return { key: `db-${m.id}`, role: m.role, content: m.content, kind: m.meta?.kind, image: Boolean(m.meta?.image), agents: m.meta?.agents };
}

export function Studio({ initialProject, initialMessages }: { initialProject: StudioProject; initialMessages: ProjectMessage[] }) {
  const { t, locale } = useI18n();
  const { refreshRecent } = useAuth();
  const [project, setProject] = useState(initialProject);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages.map(toChat));
  const gen = useGeneration(project.id);
  const [test, setTest] = useState<TestStatus>({ status: "idle" });
  const [testRun, setTestRun] = useState<{ key: number; html: string; assets: AssetMap } | null>(null);
  const [runtimeErrors, setRuntimeErrors] = useState<RuntimeError[]>([]);
  const [playing, setPlaying] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dialog, setDialog] = useState<"share" | "download" | "versions" | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "game">(initialProject.html ? "game" : "chat");
  const [editingTitle, setEditingTitle] = useState(false);
  const autoFixRounds = useRef(0);
  const lastRequest = useRef<StartOptions | null>(null);
  const handledGen = useRef<number | null>(null);

  const running = gen?.status === "running";

  const run = useCallback(
    (options: Omit<StartOptions, "projectId" | "locale">) => {
      const full: StartOptions = { ...options, projectId: project.id, locale };
      lastRequest.current = full;
      setTest({ status: "idle" });
      setTestRun(null);
      startGeneration(full);
    },
    [project.id, locale],
  );

  const send = useCallback(
    (text: string, image?: ImageInput) => {
      autoFixRounds.current = 0;
      setMessages((m) => [...m, { key: `local-${Date.now()}`, role: "user", content: text, image: Boolean(image) }]);
      run({ prompt: text, image, kind: project.html ? "edit" : "create" });
    },
    [run, project.html],
  );

  const fix = useCallback(
    (errors: RuntimeError[], auto: boolean) => {
      if (!errors.length) return;
      if (!auto) autoFixRounds.current = 0;
      setMessages((m) => [...m, { key: `local-${Date.now()}`, role: "user", content: "", kind: "fix" }]);
      run({ prompt: "", runtimeErrors: errors, kind: "fix" });
    },
    [run],
  );

  // Start the generation handed over from the home page.
  useEffect(() => {
    if (startedPending.has(project.id)) return;
    startedPending.add(project.id);
    const pending = takePendingPrompt(project.id);
    if (pending && !initialProject.html && !gen) {
      setMessages((m) => (m.length ? m : [{ key: "pending", role: "user", content: pending.prompt, image: Boolean(pending.image) }]));
      run({ prompt: pending.prompt, image: pending.image, kind: "create" });
    } else if (gen && gen.status !== "running") {
      // A generation finished while the user was elsewhere; the server data is already fresh.
      handledGen.current = gen.id;
      clearGeneration(project.id);
    }
  }, [project.id]);

  // Apply finished generations.
  useEffect(() => {
    if (!gen || gen.status === "running" || handledGen.current === gen.id) return;
    handledGen.current = gen.id;
    if (gen.status === "done" && gen.result) {
      const r = gen.result;
      setProject((p) => ({ ...p, html: r.html, assets: r.assets, title: r.title, emoji: r.emoji, palette: r.palette, plan: gen.plan ?? p.plan }));
      const agents = [...new Set(gen.stages.filter((st) => st.status === "done" && st.stage !== "save").map((st) => st.stage))];
      setMessages((m) => [...m, { key: `gen-${gen.id}`, role: "assistant", content: r.message || "✓", kind: gen.kind === "fix" ? "fix" : undefined, agents }]);
      if (typeof r.remaining === "number") setRemaining(r.remaining);
      setRuntimeErrors([]);
      setPlaying(true);
      setPlayKey((k) => k + 1);
      setMobileTab("game");
      setTest({ status: "running" });
      setTestRun({ key: gen.id, html: r.html, assets: r.assets });
      clearGeneration(project.id);
      void refreshRecent();
    }
  }, [gen, project.id, refreshRecent]);

  const onTestResult = useCallback(
    (errors: RuntimeError[]) => {
      setTestRun(null);
      if (!errors.length) {
        setTest({ status: "passed" });
        return;
      }
      const auto = autoFixRounds.current < MAX_AUTO_FIX_ROUNDS;
      setTest({ status: "failed", count: errors.length, fixing: auto });
      setRuntimeErrors(errors);
      if (auto) {
        autoFixRounds.current += 1;
        fix(errors, true);
      }
    },
    [fix],
  );

  const onRuntimeError = useCallback((e: RuntimeError) => {
    setRuntimeErrors((list) => (list.some((x) => x.message === e.message && x.line === e.line) || list.length >= 10 ? list : [...list, e]));
  }, []);

  async function saveTitle(title: string) {
    const value = title.trim().slice(0, 80);
    setEditingTitle(false);
    if (!value || value === project.title) return;
    setProject((p) => ({ ...p, title: value }));
    await getSupabase().from("projects").update({ title: value }).eq("id", project.id);
    void refreshRecent();
  }

  async function publish(value: boolean) {
    const supabase = getSupabase();
    let author: string | null = null;
    if (value) {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle<{ display_name: string | null }>();
        author = profile?.display_name || (auth.user.is_anonymous ? null : auth.user.email?.split("@")[0]) || null;
      }
    }
    const patch = value ? { is_public: true, published_at: new Date().toISOString(), author_name: author } : { is_public: false };
    const { error } = await supabase.from("projects").update(patch).eq("id", project.id);
    if (!error) setProject((p) => ({ ...p, is_public: value }));
  }

  async function restore(version: { html: string; assets: AssetMap; summary: string }) {
    const supabase = getSupabase();
    await supabase.from("projects").update({ html: version.html, assets: version.assets }).eq("id", project.id);
    await supabase.from("project_versions").insert({ project_id: project.id, html: version.html, assets: version.assets, summary: `↩ ${version.summary}`.slice(0, 300) });
    setProject((p) => ({ ...p, html: version.html, assets: version.assets }));
    setRuntimeErrors([]);
    setPlaying(true);
    setPlayKey((k) => k + 1);
  }

  const retry =
    gen?.status === "error" && lastRequest.current && gen.errorCode !== "quota"
      ? () => {
          const last = lastRequest.current!;
          startGeneration(last);
        }
      : null;

  const liveCode = gen && running ? streamingCode(gen.text) : "";
  const exportable = {
    id: project.id,
    title: project.title,
    emoji: project.emoji,
    palette: project.palette,
    description: project.description,
    html: project.html ?? "",
    assets: project.assets,
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-white/80 px-3 py-2.5 ps-16 backdrop-blur lg:ps-4">
        <Link href="/games" className="hidden rounded-lg p-1.5 text-ink-soft hover:bg-black/5 sm:block" aria-label={t("nav.myGames")}>
          <ChevronLeftIcon size={18} className="rtl:rotate-180" />
        </Link>
        <span className="text-xl leading-none">{project.emoji}</span>
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={project.title}
            onBlur={(e) => saveTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            className="min-w-0 max-w-xs flex-1 rounded-lg border border-brand-200 px-2 py-1 text-[0.95rem] font-semibold outline-none"
          />
        ) : (
          <button onClick={() => setEditingTitle(true)} className="min-w-0 truncate rounded-lg px-1.5 py-1 text-start text-[0.95rem] font-semibold hover:bg-black/5" title={t("studio.rename")}>
            {project.title}
          </button>
        )}
        {project.is_public && (
          <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 sm:flex">
            <GlobeIcon size={12} /> {t("studio.published")}
          </span>
        )}

        <div className="ms-auto flex items-center gap-1">
          <button onClick={() => setDialog("versions")} className="hidden items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-black/5 hover:text-ink md:flex">
            <HistoryIcon size={17} /> {t("studio.history")}
          </button>
          <button
            onClick={() => setDialog("download")}
            disabled={!project.html}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-ink-soft hover:bg-black/5 hover:text-ink disabled:opacity-40"
            aria-label={t("studio.download")}
          >
            <DownloadIcon size={17} /> <span className="hidden md:inline">{t("studio.download")}</span>
          </button>
          <button
            onClick={() => setDialog("share")}
            disabled={!project.html}
            className="flex items-center gap-1.5 rounded-xl bg-brand-500 px-3.5 py-2 text-sm font-medium text-white shadow-sm shadow-brand-500/30 hover:bg-brand-600 disabled:opacity-40"
          >
            <ShareIcon size={17} /> <span className="hidden sm:inline">{project.is_public ? t("studio.share") : t("studio.publish")}</span>
          </button>
        </div>
      </header>

      <div className="flex border-b border-line bg-white lg:hidden">
        {(["chat", "game"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setMobileTab(k)}
            className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm ${mobileTab === k ? "border-b-2 border-brand-500 font-medium text-brand-600" : "text-ink-soft"}`}
          >
            {k === "chat" ? <ChatIcon size={16} /> : <PlayIcon size={13} />}
            {k === "chat" ? "Chat" : t("studio.preview")}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        <section className={`min-h-0 w-full border-e border-line bg-canvas lg:block lg:w-[400px] xl:w-[440px] ${mobileTab === "chat" ? "block" : "hidden"}`}>
          <ChatPanel
            messages={messages.length ? messages : [{ key: "welcome", role: "assistant", content: t("studio.welcome") }]}
            gen={gen}
            test={test}
            hasGame={Boolean(project.html)}
            remaining={remaining}
            onSend={send}
            onStop={() => stopGeneration(project.id)}
            onRetry={retry}
          />
        </section>
        <section className={`min-h-0 min-w-0 flex-1 bg-white lg:block ${mobileTab === "game" ? "block" : "hidden"}`}>
          <PreviewPanel
            game={project}
            busy={running}
            liveCode={liveCode}
            playKey={playKey}
            playing={playing}
            onPlay={() => setPlaying(true)}
            onRestart={() => {
              setRuntimeErrors([]);
              setPlaying(true);
              setPlayKey((k) => k + 1);
            }}
            runtimeErrors={runtimeErrors}
            onRuntimeError={onRuntimeError}
            onFixErrors={() => fix(runtimeErrors, false)}
          />
        </section>
      </div>

      {testRun && <GameTester key={testRun.key} gameId={project.id} html={testRun.html} assets={testRun.assets} locale={locale} onResult={onTestResult} />}

      <ShareDialog
        open={dialog === "share"}
        onClose={() => setDialog(null)}
        projectId={project.id}
        isPublic={project.is_public}
        multiplayer={project.multiplayer || Boolean(project.plan?.multiplayer)}
        onPublish={publish}
      />
      <DownloadDialog open={dialog === "download"} onClose={() => setDialog(null)} game={exportable} />
      <VersionsDialog open={dialog === "versions"} onClose={() => setDialog(null)} projectId={project.id} onRestore={restore} />
    </div>
  );
}
