// Central registry for manager-level permissions granted to
// `restaurant_team_members`. Two flags today (hiring, schedule); new
// permissions plug in here without shotgun-editing the UI.
//
// DB shape unchanged: each key still maps 1:1 to a boolean column on
// `restaurant_team_members`.

export type ManagerPermission = "hiring" | "schedule";

export const PERMISSION_KEYS: readonly ManagerPermission[] = ["hiring", "schedule"] as const;

export type PermissionMeta = {
  /** Team-card switch label. */
  label: string;
  /** One-word display name ("Hiring" / "Scheduling"). */
  shortLabel: string;
  /** Badge shown on active-login rows. */
  badgeLabel: string;
  /** DB column on restaurant_team_members. */
  column: "can_manage_hiring" | "can_manage_schedule";
  /** Camel-cased field on TeamMember. */
  memberFlag: "canManageHiring" | "canManageSchedule";
  /** Tab keys the scoped dashboard should expose. */
  tabs: string[];
  /** Lowercase verb used in invite copy ("hiring" / "scheduling"). */
  inviteNoun: string;
  toastOn: string;
  toastOff: string;
  /** Longer description shown in setup wizard / help copy. */
  description: string;
};

export const PERMISSION_META: Record<ManagerPermission, PermissionMeta> = {
  hiring: {
    label: "Can manage hiring & interviews",
    shortLabel: "Hiring",
    badgeLabel: "Hiring access",
    column: "can_manage_hiring",
    memberFlag: "canManageHiring",
    tabs: ["jobs"],
    inviteNoun: "hiring",
    toastOn: "Hiring access enabled",
    toastOff: "Hiring access removed",
    description: "Review applications, run interviews, and send hire invites.",
  },
  schedule: {
    label: "Can manage scheduling",
    shortLabel: "Scheduling",
    badgeLabel: "Scheduling access",
    column: "can_manage_schedule",
    memberFlag: "canManageSchedule",
    tabs: ["schedule", "trades", "timeoff"],
    inviteNoun: "scheduling",
    toastOn: "Scheduling access enabled",
    toastOff: "Scheduling access removed",
    description: "Build the weekly schedule, approve trades, and handle time off.",
  },
};

export function permissionsFromFlags(
  canManageHiring: boolean,
  canManageSchedule: boolean,
): Set<ManagerPermission> {
  const s = new Set<ManagerPermission>();
  if (canManageHiring) s.add("hiring");
  if (canManageSchedule) s.add("schedule");
  return s;
}

export function permissionsFromMember(m: {
  canManageHiring: boolean;
  canManageSchedule: boolean;
}): Set<ManagerPermission> {
  return permissionsFromFlags(m.canManageHiring, m.canManageSchedule);
}

/** Flatten each permission's `tabs` into the scoped-dashboard tab list, keeping registry order. */
export function scopedTabsFor(permissions: Set<ManagerPermission>): string[] {
  const tabs: string[] = [];
  for (const key of PERMISSION_KEYS) {
    if (permissions.has(key)) tabs.push(...PERMISSION_META[key].tabs);
  }
  return tabs;
}

/** "Hiring", "Scheduling", or "Hiring & Scheduling" — for headers/nav labels. */
export function permissionsShortTitle(permissions: Set<ManagerPermission>): string {
  const labels = PERMISSION_KEYS.filter((k) => permissions.has(k)).map(
    (k) => PERMISSION_META[k].shortLabel,
  );
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  return labels.join(" & ");
}

/** "hiring", "scheduling", or "hiring and scheduling" — for invite prose. */
export function permissionsDescriptor(permissions: Set<ManagerPermission>): string {
  const nouns = PERMISSION_KEYS.filter((k) => permissions.has(k)).map(
    (k) => PERMISSION_META[k].inviteNoun,
  );
  if (nouns.length === 0) return "";
  if (nouns.length === 1) return nouns[0];
  return nouns.slice(0, -1).join(", ") + " and " + nouns[nouns.length - 1];
}
