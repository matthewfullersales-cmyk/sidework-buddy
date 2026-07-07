import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type ProfileRole } from "./auth-context";

export function useRequireRole(role: ProfileRole, redirectTo: string) {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: redirectTo }); return; }
    if (profile && profile.role !== role) {
      navigate({ to: role === "owner" ? "/employee" : "/manager" });
    }
  }, [loading, session, profile, role, redirectTo, navigate]);
}
