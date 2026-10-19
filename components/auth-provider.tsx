"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { PROJECT_SUMMARY_COLUMNS, type ProjectSummary } from "@/lib/types";

interface AuthValue {
  configured: boolean;
  loading: boolean;
  user: User | null;
  isGuest: boolean;
  recent: ProjectSummary[];
  refreshRecent: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [recent, setRecent] = useState<ProjectSummary[]>([]);

  const refreshRecent = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setRecent([]);
      return;
    }
    const { data } = await supabase
      .from("projects")
      .select(PROJECT_SUMMARY_COLUMNS)
      .eq("user_id", auth.user.id)
      .order("updated_at", { ascending: false })
      .limit(8);
    setRecent((data ?? []) as ProjectSummary[]);
  }, [configured]);

  useEffect(() => {
    if (!configured) return;
    const supabase = getSupabase();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    refreshRecent();
  }, [user?.id, refreshRecent]);

  const value = useMemo<AuthValue>(
    () => ({ configured, loading, user, isGuest: Boolean(user?.is_anonymous), recent, refreshRecent }),
    [configured, loading, user, recent, refreshRecent],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
