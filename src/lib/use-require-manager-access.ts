import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "./auth-context";

/**
 * Manager dashboard is owner-only AND requires an active subscription.
 * Single-login model:
 *  - no session → /login
 *  - non-owner → /employee
 *  - owner whose subscription is not active or past_due → /pricing
 */
export function useRequireManagerAccess(redirectTo = "/login") {
  const { loading, session, profile } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: redirectTo }); return; }
    if (!profile) return; // wait for profile to hydrate; caller must gate UI on `checking`
    if (profile.role !== "owner") { navigate({ to: "/employee" }); return; }
    // `past_due` still gets in: Stripe is retrying the card, and locking an owner
    // out of their schedule mid-service over an expired card is worse than a few
    // days of grace. When Stripe gives up it sets the subscription to unpaid or
    // canceled, which map to inactive/canceled here and do lose access.
    if (profile.subscription_status !== "active" && profile.subscription_status !== "past_due") {
      navigate({ to: "/pricing" });
    }
  }, [loading, session, profile, redirectTo, navigate]);

  // True while we are still waiting to know who the user is.
  const checking = loading || (!!session && !profile);
  return { checking };
}
