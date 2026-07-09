import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ProfileRole = "owner" | "employee";
export type ActingRole = "owner" | "hiring_manager";

export type Profile = {
  id: string;
  role: ProfileRole;
  full_name: string;
  restaurant_name: string | null;
  employee_id: string | null;
};

export type EffectiveOwner = {
  ownerId: string;
  restaurantName: string | null;
  acting: ActingRole;
} | null;

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  effectiveOwner: EffectiveOwner;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshEffectiveOwner: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [effectiveOwner, setEffectiveOwner] = useState<EffectiveOwner>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, role, full_name, restaurant_name, employee_id")
      .eq("id", uid)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  };

  const loadEffectiveOwner = async (uid: string | undefined) => {
    if (!uid) {
      setEffectiveOwner(null);
      return;
    }
    const { data, error } = await supabase.rpc("get_effective_owner");
    if (error || !data || data.length === 0) {
      setEffectiveOwner(null);
      return;
    }
    const row = data[0] as { owner_id: string; restaurant_name: string | null; acting: string };
    setEffectiveOwner({
      ownerId: row.owner_id,
      restaurantName: row.restaurant_name,
      acting: row.acting === "hiring_manager" ? "hiring_manager" : "owner",
    });
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer to avoid deadlock
      setTimeout(() => {
        void loadProfile(s?.user.id);
        void loadEffectiveOwner(s?.user.id);
      }, 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      Promise.all([
        loadProfile(data.session?.user.id),
        loadEffectiveOwner(data.session?.user.id),
      ]).finally(() => setLoading(false));
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    effectiveOwner,
    loading,
    signOut: async () => { await supabase.auth.signOut(); },
    refreshProfile: async () => { await loadProfile(session?.user.id); },
    refreshEffectiveOwner: async () => { await loadEffectiveOwner(session?.user.id); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
