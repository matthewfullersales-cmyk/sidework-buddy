import { useCallback, useEffect, useState } from "react";
import {
  fetchTeamMembers,
  insertTeamMember,
  updateTeamMember,
  deleteTeamMember,
  setTeamMemberHiringPermission,
  setTeamMemberSchedulePermission,
  type TeamMember,
  type TeamMemberInput,
} from "@/lib/hiring-supabase";
import { useAuth } from "@/lib/auth-context";

export function useTeamMembers() {
  const { effectiveOwner, loading: authLoading } = useAuth();
  const ownerId = effectiveOwner?.ownerId ?? null;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async (uid: string | null) => {
    if (!uid) { setMembers([]); setLoading(false); return; }
    setLoading(true);
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
    if (authLoading) return;
    void reload(ownerId);
  }, [authLoading, ownerId, reload]);

  return {
    members,
    loading,
    ownerId,
    add: async (data: TeamMemberInput) => {
      if (!ownerId) throw new Error("Not signed in");
      const row = await insertTeamMember(ownerId, data);
      setMembers((m) => [...m, row]);
      return row;
    },
    update: async (id: string, patch: { firstName?: string; lastName?: string | null; email?: string | null; phone?: string | null; title?: string | null }) => {
      await updateTeamMember(id, patch);
      setMembers((m) => m.map((r) => {
        if (r.id !== id) return r;
        const next: TeamMember = { ...r };
        if (patch.firstName !== undefined) next.firstName = patch.firstName.trim() || null;
        if (patch.lastName !== undefined) next.lastName = patch.lastName == null ? null : patch.lastName.trim() || null;
        if (patch.email !== undefined) next.email = patch.email;
        if (patch.phone !== undefined) next.phone = patch.phone;
        if (patch.title !== undefined) next.title = patch.title;
        const combined = [next.firstName, next.lastName].filter(Boolean).join(" ").trim();
        if (combined) next.name = combined;
        return next;
      }));
    },
    setPermission: async (id: string, canManageHiring: boolean) => {
      await setTeamMemberHiringPermission(id, canManageHiring);
      setMembers((m) => m.map((r) => (r.id === id ? { ...r, canManageHiring } : r)));
    },
    setSchedulePermission: async (id: string, canManageSchedule: boolean) => {
      await setTeamMemberSchedulePermission(id, canManageSchedule);
      setMembers((m) => m.map((r) => (r.id === id ? { ...r, canManageSchedule } : r)));
    },
    remove: async (id: string) => {
      await deleteTeamMember(id);
      setMembers((m) => m.filter((r) => r.id !== id));
    },
  };
}
