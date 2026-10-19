import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getT } from "@/lib/i18n/server";
import { Studio, type StudioProject } from "@/components/studio/studio";
import type { ProjectMessage } from "@/lib/types";

export const metadata: Metadata = { title: "Studio" };

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t } = await getT();
  if (!isSupabaseConfigured()) return <Notice text={t("home.notConfigured")} />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: project } = /^[0-9a-f-]{36}$/i.test(id)
    ? await supabase
        .from("projects")
        .select("id,user_id,title,description,emoji,palette,html,assets,is_public,multiplayer,plan")
        .eq("id", id)
        .maybeSingle<StudioProject & { user_id: string }>()
    : { data: null };

  if (!project || !user || project.user_id !== user.id) return <Notice text={t("studio.notFound")} link={project?.is_public ? `/play/${id}` : "/"} />;

  const { data: messages } = await supabase
    .from("project_messages")
    .select("id,project_id,role,content,meta,created_at")
    .eq("project_id", id)
    .order("id", { ascending: true })
    .limit(200);

  return <Studio initialProject={project} initialMessages={(messages ?? []) as ProjectMessage[]} />;
}

function Notice({ text, link = "/" }: { text: string; link?: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-3xl border border-line bg-white p-8 text-center shadow-card">
        <p className="text-ink-soft">{text}</p>
        <Link href={link} className="mt-5 inline-block rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white">
          Prefly
        </Link>
      </div>
    </div>
  );
}
