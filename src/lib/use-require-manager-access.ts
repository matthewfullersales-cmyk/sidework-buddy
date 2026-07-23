import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "./auth-context";

/**
 * Manager dashboard is owner-only AND requires an active subscription.
 * Single-login model:
 *  - no session → /login
 *  - non-owner → /employee
 *  - owner without active subscription → /pricing
 */
export function useRequireManagerAccess(redirectTo = "/login") {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: redirectTo }); return; }
    if (!profile) return; // wait for profile to hydrate
    if (profile.role !== "owner") { navigate({ to: "/employee" }); return; }
    if (profile.subscription_status !== "active") {
      navigate({ to: "/pricing" });
    }
  }, [loading, session, profile, redirectTo, navigate]);
}
