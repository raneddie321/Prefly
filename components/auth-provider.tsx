"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { listProjects } from "@/lib/data";
import { canUseModel, defaultModel, isModelKey, PLAN_LIMITS, type ModelKey, type PlanId } from "@/lib/plans";
import type { ProjectSummary } from "@/lib/types";

interface Usage {
  used: number;
  limit: number;
}

interface AuthValue {
  configured: boolean;
  aiEnabled: boolean;
  billingEnabled: boolean;
  loading: boolean;
  user: User | null;
  isGuest: boolean;
  plan: PlanId;
  usage: Usage | null;
  refreshUsage: () => Promise<void>;
  model: ModelKey;
  setModel: (model: ModelKey) => void;
  recent: ProjectSummary[];
  refreshRecent: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const MODEL_KEY = "prefly:model";
const PLAN_CACHE = "prefly:plan";

export function AuthProvider({
  children,
  aiEnabled,
  billingEnabled,
}: {
  children: React.ReactNode;
  aiEnabled: boolean;
  billingEnabled: boolean;
}) {
  const configured = isSupabaseConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(configured);
  const [recent, setRecent] = useState<ProjectSummary[]>([]);
  const [serverPlan, setServerPlan] = useState<"free" | "pro">("free");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [chosenModel, setChosenModel] = useState<ModelKey | null>(null);

  // Without a database there are no accounts: everyone gets the free plan's models.
  const plan: PlanId = !configured ? "free" : !user || user.is_anonymous ? "guest" : serverPlan;

  const refreshRecent = useCallback(async () => {
    setRecent(await listProjects(8));
  }, []);

  const refreshUsage = useCallback(async () => {
    if (!configured) return;
    const { data: auth } = await getSupabase().auth.getUser();
    if (!auth.user) {
      setUsage(null);
      setServerPlan("free");
      return;
    }
    const { data } = await getSupabase().rpc("generation_usage");
    const u = data as { plan?: string; used?: number; limit?: number } | null;
    if (u) {
      const next = u.plan === "pro" ? "pro" : "free";
      setServerPlan(next);
      try {
        localStorage.setItem(PLAN_CACHE, next);
      } catch {
        // ignore
      }
      setUsage({ used: u.used ?? 0, limit: u.limit ?? PLAN_LIMITS.free.daily });
    }
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
    void refreshRecent();
    void refreshUsage();
  }, [user?.id, refreshRecent, refreshUsage]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(MODEL_KEY) as ModelKey | null;
      if (saved) setChosenModel(saved);
      // Show the last known plan right away; refreshUsage confirms it with the server.
      if (localStorage.getItem(PLAN_CACHE) === "pro") setServerPlan("pro");
    } catch {
      // ignore
    }
  }, []);

  const setModel = useCallback((m: ModelKey) => {
    setChosenModel(m);
    try {
      localStorage.setItem(MODEL_KEY, m);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<AuthValue>(() => {
    const model = chosenModel && isModelKey(chosenModel) && canUseModel(plan, chosenModel) ? chosenModel : defaultModel(plan);
    return {
      configured,
      aiEnabled,
      billingEnabled,
      loading,
      user,
      isGuest: Boolean(user?.is_anonymous),
      plan,
      usage,
      refreshUsage,
      model,
      setModel,
      recent,
      refreshRecent,
    };
  }, [configured, aiEnabled, billingEnabled, loading, user, plan, usage, refreshUsage, chosenModel, setModel, recent, refreshRecent]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
