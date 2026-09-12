import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/** Server Supabase client for RSC and server actions. Anon key, RLS enforced. */
export async function getServerSupabase() {
  const store = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Middleware/route handlers refresh the session instead.
          }
        },
      },
    },
  );
}
