"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser Supabase client. Uses the anon key — safe to ship, because RLS is
 * what actually protects the data. In particular `versions` has no client
 * update policy at all, so a hostile client cannot forge a finished model.
 */
let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getSupabase() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}

/** Anonymous sign-in, so a room needs no signup. Returns the user id. */
export async function ensureSignedIn(): Promise<string> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;

  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error) throw new Error(`Could not sign in: ${error.message}`);
  return signed.user!.id;
}
