import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ProfileRole = "owner" | "employee";

export type Profile = {
  id: string;
  role: ProfileRole;
  full_name: string;
  restaurant_name: string | null;
  employee_id: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
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

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer profile fetch to avoid deadlock
      setTimeout(() => { void loadProfile(s?.user.id); }, 0);
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void loadProfile(data.session?.user.id).finally(() => setLoading(false));
    });

    return () => { sub.subscription.unsubscribe(); };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signOut: async () => { await supabase.auth.signOut(); },
    refreshProfile: async () => { await loadProfile(session?.user.id); },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
