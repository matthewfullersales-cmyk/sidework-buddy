// Public (unauthenticated) resolution of a /join/<slug> link to a restaurant.
// Exposes ONLY the owner id and the restaurant display name.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type JoinRestaurant = { ownerId: string; restaurantName: string } | null;

export const resolveJoinRestaurant = createServerFn({ method: "GET" })
  .inputValidator((input: { slug: string }) => ({ slug: String(input?.slug ?? "").slice(0, 60) }))
  .handler(async ({ data }): Promise<JoinRestaurant> => {
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
    if (!url || !key) throw new Error("Supabase is not configured");

    const client = createClient<Database>(url, key, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data: rows, error } = await client.rpc("get_public_join_restaurant", { p_slug: data.slug });
    if (error) {
      console.error("[resolveJoinRestaurant]", error.message);
      throw new Error("Could not look up that join link");
    }
    const row = (rows ?? [])[0];
    if (!row?.owner_id || !row?.restaurant_name) return null;
    return { ownerId: row.owner_id, restaurantName: row.restaurant_name };
  });
