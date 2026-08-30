// Role classification for shadow shifts, derived from the app's real role list
// (src/lib/role-colors.ts) rather than a parallel string array.
//
// Two SEPARATE axes:
//  - SECTION ('foh' | 'boh')     — department. Drives the entrance and the bring list.
//  - DRESS GROUP ('foh' | 'host' | 'boh') — which block of dress text a role reads.
//
// Expo and Food Runner are back of house by department but dress front of house,
// because they go out on the dining floor. Host is front of house but may have
// its own dress. Owners can override the dress group per role in the packet.
//
// This module runs MANAGER-SIDE only: customRoles is client state the
// unauthenticated trainee page cannot see. The resolved values are stored on
// the shadow shift row at scheduling time and read back verbatim by that page.
import type { Role, CustomRole } from "@/lib/sidework-store";
import { BOH_ROLES_ORDERED } from "@/lib/role-colors";

export type ShadowSection = "foh" | "boh";
export type ShadowDressGroup = "foh" | "host" | "boh";

const BOH_SET = new Set(BOH_ROLES_ORDERED.map((r) => r.trim().toLowerCase()));

/** Roles that live in back of house but wear the front of house uniform. */
const FOH_DRESS_BOH_ROLES = new Set(["expo", "food runner"]);

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
  if (FOH_DRESS_BOH_ROLES.has(r)) return "foh";
  return shadowSectionForRole(role, customRoles);
}

/** Owner override wins over the derived default when present. */
export function dressGroupForRole(
  role: string,
  customRoles: CustomRole[] = [],
  overrides: Record<string, ShadowDressGroup> = {},
): ShadowDressGroup {
  const explicit = overrides[role] ?? overrides[(role ?? "").trim()];
  if (explicit === "foh" || explicit === "host" || explicit === "boh") return explicit;
  return defaultDressGroupForRole(role, customRoles);
}

export type { Role };
