import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "./auth-context";

/**
 * Allows access to the manager dashboard for:
 *  - actual owners (profiles.role === "owner")
 *  - team members with any granted permission (can_manage_hiring OR
 *    can_manage_schedule) via a claimed restaurant_team_members row
 * Anyone else is redirected.
 */
export function useRequireManagerAccess(redirectTo = "/login") {
  const { loading, session, profile, effectiveOwner } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: redirectTo }); return; }
    const isOwner = profile?.role === "owner";
    const isTeamManager =
      effectiveOwner?.acting === "team_member" &&
      (effectiveOwner.permissions?.size ?? 0) > 0;
    if (!isOwner && !isTeamManager) {
      navigate({ to: "/employee" });
    }
  }, [loading, session, profile, effectiveOwner, redirectTo, navigate]);
}
