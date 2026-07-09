import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchTeamMembers,
  insertTeamMember,
  updateTeamMember,
  deleteTeamMember,
  type TeamMember,
} from "@/lib/hiring-supabase";

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  const reload = useCallback(async (uid: string | null) => {
    if (!uid) { setMembers([]); setLoading(false); return; }
    try {
      const res = await fetchTeamMembers(uid);
      setMembers(res);
    } catch (e) {
      console.error("[useTeamMembers]", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id ?? null;
      if (cancelled) return;
      setOwnerId(uid);
      void reload(uid);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const uid = session?.user.id ?? null;
      setOwnerId(uid);
      void reload(uid);
    });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [reload]);

  return {
    members,
    loading,
    ownerId,
    add: async (data: { name: string; email?: string; phone?: string; title?: string }) => {
      if (!ownerId) throw new Error("Not signed in");
      const row = await insertTeamMember(ownerId, data);
      setMembers((m) => [...m, row]);
      return row;
    },
    update: async (id: string, patch: { name?: string; email?: string | null; phone?: string | null; title?: string | null }) => {
      await updateTeamMember(id, patch);
      setMembers((m) => m.map((r) => (r.id === id ? { ...r, ...patch } as TeamMember : r)));
    },
    remove: async (id: string) => {
      await deleteTeamMember(id);
      setMembers((m) => m.filter((r) => r.id !== id));
    },
  };
}
