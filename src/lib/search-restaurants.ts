import { supabase } from "@/integrations/supabase/client";

export type RestaurantSearchResult = {
  owner_id: string;
  restaurant_name: string;
  slug: string;
};

export async function searchRestaurants(q: string): Promise<RestaurantSearchResult[]> {
  const query = q.trim();
  if (!query) return [];
  const { data, error } = await supabase.rpc("search_restaurants", { q: query });
  if (error) throw error;
  return (data ?? []) as RestaurantSearchResult[];
}
