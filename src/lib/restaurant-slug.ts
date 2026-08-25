// Browser-side helpers for the owner's public join-link slug (stored on profiles).
import { supabase } from "@/integrations/supabase/client";

export type JoinSlugState = {
  /** Current slug, or null when none can exist yet (no restaurant name set). */
  slug: string | null;
  restaurantName: string | null;
};

/** Reads the signed-in owner's restaurant name and allocates a slug if missing. */
export async function loadMyJoinSlug(): Promise<JoinSlugState> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) return { slug: null, restaurantName: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("slug, restaurant_name")
    .eq("id", uid)
    .maybeSingle();

  const restaurantName = profile?.restaurant_name?.trim() || null;
  if (!restaurantName) return { slug: null, restaurantName: null };
  if (profile?.slug) return { slug: profile.slug, restaurantName };

  const { data: ensured, error } = await supabase.rpc("ensure_my_restaurant_slug");
  if (error) {
    console.error("[loadMyJoinSlug]", error.message);
    return { slug: null, restaurantName };
  }
  return { slug: (ensured as string | null) ?? null, restaurantName };
}

/** Changes the slug. The previous slug keeps resolving as an alias. */
export async function setMyJoinSlug(next: string): Promise<string> {
  const { data, error } = await supabase.rpc("set_restaurant_slug", { p_slug: next });
  if (error) throw new Error(error.message);
  return data as string;
}
