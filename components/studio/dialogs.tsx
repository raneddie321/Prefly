"use client";

import { useEffect, useState } from "react";
import { useI18n, useRelativeTime } from "@/lib/i18n/client";
import { getSupabase } from "@/lib/supabase/client";
import { copyText, playUrl } from "@/lib/share";
import { downloadHtml, downloadZip, type ExportableGame } from "@/lib/export";
import type { AssetMap, ProjectVersion } from "@/lib/types";
import { Modal } from "../modal";
import { CheckIcon, CopyIcon, DownloadIcon, GlobeIcon, LinkIcon, LockIcon, MonitorIcon, PhoneIcon, PlayIcon, SpinnerIcon, UsersIcon } from "../icons";

export function ShareDialog({
  open,
  onClose,
  projectId,
  isPublic,
  multiplayer,
  onPublish,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  isPublic: boolean;
  multiplayer: boolean;
  onPublish: (value: boolean) => Promise<void>;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = typeof window === "undefined" ? "" : playUrl(projectId);

  async function copy(kind: string, text: string) {
    if ((await copyText(text)) === "copied") {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    }
  }

  async function toggle(value: boolean) {
    setBusy(true);
    try {
      await onPublish(value);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("share.title")}>
      <div className="flex items-start gap-3 rounded-2xl bg-canvas p-4">
        <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${isPublic ? "bg-emerald-100 text-emerald-700" : "bg-white text-ink-soft"}`}>
          {isPublic ? <GlobeIcon size={18} /> : <LockIcon size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{isPublic ? t("studio.published") : t("games.private")}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{isPublic ? t("share.publicHint") : t("share.privateHint")}</p>
        </div>
      </div>

      {isPublic ? (
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5" dir="ltr">
            <LinkIcon size={16} className="shrink-0 text-ink-muted" />
            <span className="min-w-0 flex-1 truncate text-sm">{url}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => copy("link", url)} className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600">
              {copied === "link" ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              {copied === "link" ? t("studio.copied") : t("share.copyLink")}
            </button>
            <a href={url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-medium hover:bg-canvas">
              <PlayIcon size={14} />
              {t("share.openPlayer")}
            </a>
          </div>
          {multiplayer && (
            <p className="flex items-center gap-2 text-xs text-ink-soft">
              <UsersIcon size={14} /> {t("share.invite")}: {t("home.multiplayerHint")}
            </p>
          )}
          <button disabled={busy} onClick={() => toggle(false)} className="mt-2 text-sm text-ink-soft underline-offset-2 hover:text-ink hover:underline">
            {t("studio.unpublish")}
          </button>
        </div>
      ) : (
        <button
          disabled={busy}
          onClick={() => toggle(true)}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 font-medium text-white hover:bg-brand-600 disabled:opacity-60"
        >
          {busy ? <SpinnerIcon size={18} /> : <GlobeIcon size={18} />}
          {t("share.makePublic")}
        </button>
      )}
    </Modal>
  );
}

export function DownloadDialog({ open, onClose, game }: { open: boolean; onClose: () => void; game: ExportableGame }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(kind: "html" | "zip") {
    setBusy(kind);
    try {
      if (kind === "html") downloadHtml(game, locale);
      else await downloadZip(game, locale);
    } finally {
      setBusy(null);
    }
  }

  const options = [
    { kind: "html" as const, icon: MonitorIcon, title: t("download.html"), desc: t("download.htmlDesc") },
    { kind: "zip" as const, icon: PhoneIcon, title: t("download.zip"), desc: t("download.zipDesc") },
  ];
  return (
    <Modal open={open} onClose={onClose} title={t("download.title")}>
      <div className="flex flex-col gap-3">
        {options.map(({ kind, icon: Icon, title, desc }) => (
          <button
            key={kind}
            onClick={() => run(kind)}
            disabled={busy !== null}
            className="flex items-start gap-4 rounded-2xl border border-line p-4 text-start transition hover:border-brand-200 hover:bg-brand-50/40"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <Icon size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{title}</span>
              <span className="mt-0.5 block text-sm text-ink-soft">{desc}</span>
            </span>
            <span className="self-center text-ink-muted">{busy === kind ? <SpinnerIcon size={18} /> : <DownloadIcon size={18} />}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function VersionsDialog({
  open,
  onClose,
  projectId,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onRestore: (version: { html: string; assets: AssetMap; summary: string }) => Promise<void>;
}) {
  const { t } = useI18n();
  const relative = useRelativeTime();
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSupabase()
      .from("project_versions")
      .select("id,project_id,summary,created_at")
      .eq("project_id", projectId)
      .order("id", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!cancelled) setVersions((data ?? []) as ProjectVersion[]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId]);

  async function restore(id: number) {
    if (!window.confirm(t("versions.confirm"))) return;
    setBusy(id);
    const { data } = await getSupabase().from("project_versions").select("html,assets,summary").eq("id", id).single<{ html: string; assets: AssetMap; summary: string }>();
    if (data) await onRestore(data);
    setBusy(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("versions.title")} wide>
      {versions === null ? (
        <div className="flex justify-center py-8 text-ink-muted">
          <SpinnerIcon />
        </div>
      ) : versions.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-soft">{t("versions.empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {versions.map((v, i) => (
            <li key={v.id} className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-sm font-semibold text-ink-soft">v{versions.length - i}</span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm">{v.summary}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{relative(v.created_at)}</p>
              </div>
              {i === 0 ? (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-600">{t("versions.current")}</span>
              ) : (
                <button
                  onClick={() => restore(v.id)}
                  disabled={busy !== null}
                  className="flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-sm hover:bg-canvas"
                >
                  {busy === v.id && <SpinnerIcon size={14} />}
                  {t("versions.restore")}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
