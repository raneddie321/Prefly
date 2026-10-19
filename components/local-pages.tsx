"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";
import { localStore, type LocalProject } from "@/lib/local-store";
import { Studio } from "./studio/studio";
import { PlayView } from "./play-view";
import { SpinnerIcon } from "./icons";

/** Loads a project from localStorage (no-database mode). */
function useLocalProject(id: string): LocalProject | null | undefined {
  const [project, setProject] = useState<LocalProject | null | undefined>(undefined);
  useEffect(() => {
    setProject(localStore.get(id));
  }, [id]);
  return project;
}

function Missing() {
  const { t } = useI18n();
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

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-ink-muted">
      <SpinnerIcon size={28} />
    </div>
  );
}

export function LocalStudio({ id }: { id: string }) {
  const project = useLocalProject(id);
  if (project === undefined) return <Loading />;
  if (!project) return <Missing />;
  return <Studio initialProject={project} initialMessages={project.messages} />;
}

export function LocalPlay({ id, room }: { id: string; room: string | null }) {
  const project = useLocalProject(id);
  if (project === undefined) return <Loading />;
  if (!project?.html) return <Missing />;
  return <PlayView game={{ ...project, author_name: null, play_count: 0 }} room={room} isOwner />;
}
