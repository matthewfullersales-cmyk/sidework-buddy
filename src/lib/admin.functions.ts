import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_EMAILS = new Set([
  "matthewfullersales@gmail.com",
  "hello@86paper.com",
]);

export type AdminRestaurantRow = {
  userId: string;
  restaurantName: string | null;
  ownerName: string;
  ownerEmail: string;
  signupDate: string;
  employeeCount: number;
};

export type AdminOverview = {
  totalOwners: number;
  totalEmployees: number;
  signupsThisWeek: number;
  restaurants: AdminRestaurantRow[];
};

function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.has(email.toLowerCase());
}

export const checkAdminAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    return { isAdmin: isAdminEmail(email), email: email ?? null };
  });

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminOverview> => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    if (!isAdminEmail(email)) {
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, role, full_name, restaurant_name, created_at")
      .order("created_at", { ascending: false });
    if (profErr) throw profErr;

    // Fetch emails via auth admin (paginated; simple first-1000)
    const { data: usersData, error: usersErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (usersErr) throw usersErr;
    const emailById = new Map<string, string>();
    for (const u of usersData.users) {
      if (u.email) emailById.set(u.id, u.email);
    }

    const owners = (profiles ?? []).filter((p) => p.role === "owner");
    const employees = (profiles ?? []).filter((p) => p.role === "employee");

    // Per-restaurant employee count via restaurant_name match (best-effort;
    // employees don't currently have an explicit restaurant link).
    const employeeCountByRestaurant = new Map<string, number>();
    for (const e of employees) {
      const key = (e.restaurant_name ?? "").trim().toLowerCase();
      if (!key) continue;
      employeeCountByRestaurant.set(key, (employeeCountByRestaurant.get(key) ?? 0) + 1);
    }

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const signupsThisWeek = (profiles ?? []).filter(
      (p) => new Date(p.created_at).getTime() >= oneWeekAgo,
    ).length;

    const restaurants: AdminRestaurantRow[] = owners.map((o) => {
      const key = (o.restaurant_name ?? "").trim().toLowerCase();
      return {
        userId: o.id,
        restaurantName: o.restaurant_name,
        ownerName: o.full_name || "—",
        ownerEmail: emailById.get(o.id) ?? "—",
        signupDate: o.created_at,
        employeeCount: key ? employeeCountByRestaurant.get(key) ?? 0 : 0,
      };
    });

    return {
      totalOwners: owners.length,
      totalEmployees: employees.length,
      signupsThisWeek,
      restaurants,
    };
  });
