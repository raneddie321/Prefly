"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

let browserClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!browserClient) {
    browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return browserClient;
}

/**
 * Returns the signed-in user, creating an anonymous guest account when nobody
 * is signed in. Guests get a real account so their games are saved and can
 * later be claimed by adding an email address.
 */
export async function ensureUser() {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getUser();
  if (data.user) return data.user;
  const { data: anon, error } = await supabase.auth.signInAnonymously();
  if (error || !anon.user) {
    throw new Error(error?.message ?? "Could not start a guest session");
  }
  return anon.user;
}
