"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listProjects } from "@/lib/data";
import type { ProjectSummary } from "@/lib/types";

interface AuthValue {
  configured: boolean;
  aiEnabled: boolean;
  loading: boolean;
  user: User | null;
  isGuest: boolean;
  recent: ProjectSummary[];
  refreshRecent: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children, aiEnabled }: { children: React.ReactNode; aiEnabled: boolean }) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [recent, setRecent] = useState<ProjectSummary[]>([]);

  const refreshRecent = useCallback(async () => {
    setRecent(await listProjects(8));
  }, []);

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
    () => ({ configured, aiEnabled, loading, user, isGuest: Boolean(user?.is_anonymous), recent, refreshRecent }),
    [configured, aiEnabled, loading, user, recent, refreshRecent],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
