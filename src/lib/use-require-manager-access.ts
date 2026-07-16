import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "./auth-context";

/**
 * Manager dashboard is owner-only. Single-login model:
 *  - profiles.role === "owner" → allowed
 *  - anyone else → redirected to /employee
 */
export function useRequireManagerAccess(redirectTo = "/login") {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: redirectTo }); return; }
    // Wait until the profile has actually loaded before deciding — otherwise
    // owners flash through /employee for a tick right after sign-in.
    if (profile && profile.role !== "owner") {
      navigate({ to: "/employee" });
    }
  }, [loading, session, profile, redirectTo, navigate]);
}
