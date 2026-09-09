// Role classification for shadow shifts, derived from the app's real role list
// (src/lib/role-colors.ts) rather than a parallel string array.
//
// Two SEPARATE axes:
//  - SECTION ('foh' | 'boh')     — department. Drives the entrance.
//  - DRESS GROUP ('foh' | 'boh') — which block of dress text a role reads.
//
// Host has no special-cased dress bucket: like every other role it defaults to
// its section. Any position needing its own wording (Host included) uses the
// per-position custom uniform override stored in the packet, resolved on the
// read side by position name.

//
// This module runs MANAGER-SIDE only: customRoles is client state the
// unauthenticated trainee page cannot see. The resolved values are stored on
// the shadow shift row at scheduling time and read back verbatim by that page.
import type { Role, CustomRole } from "@/lib/sidework-store";
import { BOH_ROLES_ORDERED } from "@/lib/role-colors";

export type ShadowSection = "foh" | "boh";
export type ShadowDressGroup = "foh" | "host" | "boh";

const BOH_SET = new Set(BOH_ROLES_ORDERED.map((r) => r.trim().toLowerCase()));

function key(role: string): string {
  return (role ?? "").trim().toLowerCase();
}

/** Department only. Host is NOT a section — it is a dress group. */
export function shadowSectionForRole(role: string, customRoles: CustomRole[] = []): ShadowSection {
  const r = key(role);
  if (BOH_SET.has(r)) return "boh";
  const custom = customRoles.find((c) => key(c.name) === r);
  if (custom?.section === "BOH") return "boh";
  return "foh";
}

export function isBohRole(role: string, customRoles: CustomRole[] = []): boolean {
  return shadowSectionForRole(role, customRoles) === "boh";
}

/** The dress group a role uses before any owner override. */
export function defaultDressGroupForRole(role: string, customRoles: CustomRole[] = []): ShadowDressGroup {
  const r = key(role);
  if (r === "host" || r === "hostess") return "host";
  return shadowSectionForRole(role, customRoles);
}


export type { Role };
