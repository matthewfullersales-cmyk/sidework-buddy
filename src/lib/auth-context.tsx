import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchEmployeeContexts, type EmployeeContext } from "@/lib/employee-supabase";

/** sessionStorage key holding the employee's chosen restaurant for this
 * browser session only (multi-restaurant employees pick after each login). */
export const EMPLOYEE_RESTAURANT_CHOICE_KEY = "86paper_employee_restaurant_choice";

export type ProfileRole = "owner" | "employee";

export type Profile = {
  id: string;
  role: ProfileRole;
  full_name: string;
  restaurant_name: string | null;
  employee_id: string | null;
  subscription_status: string | null;
};

export type EffectiveOwner = {
  ownerId: string;
  restaurantName: string | null;
} | null;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileError: string | null;
  effectiveOwner: EffectiveOwner;
  employeeContext: EmployeeContext | null;
  /** Every restaurant context linked to this login (usually one). */
  employeeContexts: EmployeeContext[];
  /** True when the login links to 2+ restaurants and no valid session choice exists yet. */
  needsRestaurantSelection: boolean;
  /** Record a restaurant pick (session-only) and resolve it as the active context. */
  selectRestaurant: (ownerId: string) => void;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshEffectiveOwner: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [effectiveOwner, setEffectiveOwner] = useState<EffectiveOwner>(null);
  const [employeeContexts, setEmployeeContexts] = useState<EmployeeContext[]>([]);
  const [employeeContext, setEmployeeContext] = useState<EmployeeContext | null>(null);
  const [needsRestaurantSelection, setNeedsRestaurantSelection] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string | undefined) => {
    if (!uid) { setProfile(null); setProfileError(null); return; }
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, full_name, restaurant_name, employee_id, subscription_status")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      console.error("[auth] loadProfile failed", error);
      setProfileError(error.message);
      // Keep any profile we already loaded — a transient read failure must not
      // blank out a working session.
      return;
    }
    setProfileError(null);
    setProfile((data as Profile | null) ?? null);
  };

  const loadEffectiveOwner = async (uid: string | undefined) => {
    if (!uid) { setEffectiveOwner(null); return; }
    // Single-login model: only real owners get an effective-owner context.
    // The RPC's team-member fallback is ignored — team-permission grants are
    // no longer part of the product.
    const { data, error } = await supabase.rpc("get_effective_owner");
    if (error || !data || data.length === 0) { setEffectiveOwner(null); return; }
    const row = data[0] as {
      owner_id: string;
      restaurant_name: string | null;
      acting: string;
    };
    if (row.acting !== "owner") { setEffectiveOwner(null); return; }
    setEffectiveOwner({
      ownerId: row.owner_id,
      restaurantName: row.restaurant_name,
    });
  };

  const readStoredRestaurantChoice = (): string | null => {
    try { return sessionStorage.getItem(EMPLOYEE_RESTAURANT_CHOICE_KEY); }
    catch { return null; }
  };

  const loadEmployeeContext = async (uid: string | undefined) => {
    if (!uid) {
      setEmployeeContexts([]);
      setEmployeeContext(null);
      setNeedsRestaurantSelection(false);
      return;
    }
    try {
      const contexts = await fetchEmployeeContexts();
      setEmployeeContexts(contexts);
      if (contexts.length === 0) {
        setEmployeeContext(null);
        setNeedsRestaurantSelection(false);
        return;
      }
      if (contexts.length === 1) {
        // Single-restaurant employee: identical behavior to before this feature.
        setEmployeeContext(contexts[0]);
        setNeedsRestaurantSelection(false);
        return;
      }
      // Multi-restaurant: reuse this session's earlier choice if still valid.
      const stored = readStoredRestaurantChoice();
      const match = stored ? contexts.find((c) => c.ownerId === stored) : undefined;
      if (match) {
        setEmployeeContext(match);
        setNeedsRestaurantSelection(false);
      } else {
        setEmployeeContext(null);
        setNeedsRestaurantSelection(true);
      }
    } catch {
      setEmployeeContexts([]);
      setEmployeeContext(null);
      setNeedsRestaurantSelection(false);
    }
  };

  const selectRestaurant = (ownerId: string) => {
    const match = employeeContexts.find((c) => c.ownerId === ownerId);
    if (!match) return;
    try { sessionStorage.setItem(EMPLOYEE_RESTAURANT_CHOICE_KEY, ownerId); } catch {}
    setEmployeeContext(match);
    setNeedsRestaurantSelection(false);
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setTimeout(() => {
        void loadProfile(s?.user.id);
        void loadEffectiveOwner(s?.user.id);
        void loadEmployeeContext(s?.user.id);
      }, 0);
    });

    supabase.auth.getSession()
      .then(({ data }) => {
        setSession(data.session);
        return Promise.all([
          loadProfile(data.session?.user.id),
          loadEffectiveOwner(data.session?.user.id),
          loadEmployeeContext(data.session?.user.id),
        ]);
      })
      .catch((e) => { console.error("[auth] getSession failed", e); })
      .finally(() => setLoading(false));

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    profileError,
    effectiveOwner,
    employeeContext,
    employeeContexts,
    needsRestaurantSelection,
    selectRestaurant,
    loading,
    signOut: async () => {
      // Clear the session-only restaurant choice so a fresh login re-prompts.
      try { sessionStorage.removeItem(EMPLOYEE_RESTAURANT_CHOICE_KEY); } catch {}
      await supabase.auth.signOut();
    },
    refreshProfile: async () => {
      const { data } = await supabase.auth.getSession();
      await loadProfile(data.session?.user.id);
    },
    refreshEffectiveOwner: async () => {
      const { data } = await supabase.auth.getSession();
      const uid = data.session?.user.id;
      await loadEffectiveOwner(uid);
      await loadEmployeeContext(uid);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
