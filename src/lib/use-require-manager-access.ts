import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "./auth-context";

/**
 * Allows access to the manager dashboard for:
 *  - actual owners (profiles.role === "owner")
 *  - hiring managers (any auth user with a claimed restaurant_team_members row + can_manage_hiring)
 * Anyone else is redirected.
 */
export function useRequireManagerAccess(redirectTo = "/login") {
  const { loading, session, profile, effectiveOwner } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: redirectTo }); return; }
    const isOwner = profile?.role === "owner";
    const isHiringManager = effectiveOwner?.acting === "hiring_manager";
    if (!isOwner && !isHiringManager) {
      navigate({ to: "/employee" });
    }
  }, [loading, session, profile, effectiveOwner, redirectTo, navigate]);
}
