// Shared FOH/BOH/host classification for a role, derived from the app's real
// role list (src/lib/role-colors.ts) rather than a parallel string array.
// Used by the public trainee shadow shift page and the Settings packet editor.
import type { Role, CustomRole } from "@/lib/sidework-store";
import { BOH_ROLES_ORDERED } from "@/lib/role-colors";

export type ShadowSection = "host" | "foh" | "boh";

const BOH_SET = new Set(BOH_ROLES_ORDERED.map((r) => r.trim().toLowerCase()));

/**
 * Which packet section applies to a role.
 * Host (or hostess) -> "host"; any role in the canonical BOH list, or a custom
 * role declared BOH -> "boh"; everything else defaults to "foh".
 */
export function shadowSectionForRole(role: string, customRoles: CustomRole[] = []): ShadowSection {
  const r = (role ?? "").trim().toLowerCase();
  if (r === "host" || r === "hostess") return "host";
  if (BOH_SET.has(r)) return "boh";
  const custom = customRoles.find((c) => c.name.trim().toLowerCase() === r);
  if (custom?.section === "BOH") return "boh";
  return "foh";
}

export function isBohRole(role: string, customRoles: CustomRole[] = []): boolean {
  return shadowSectionForRole(role, customRoles) === "boh";
}

export type { Role };
