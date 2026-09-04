// Owner-scoped Supabase access for the employee roster.
// Wave A of the scheduling migration: employees move from localStorage to
// Supabase; shifts/time-off/trades stay local until Wave B.
import { supabase } from "@/integrations/supabase/client";
import { nextCustomColor } from "@/lib/role-colors";
import type {
  Employee,
  Role,
  Section,
  WeeklyAvailability,
  EmergencyContact,
  WorkExperience,
  CustomRole,
} from "@/lib/sidework-store";

type PersonRow = {
  id: string;
  owner_id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  state: string;
  primary_role: string | null;
  approved_roles: string[];
  auto_approve_roles: string[];
  weekly_availability: unknown;
  emergency_contact: unknown;
  invited_at: string | null;
  created_at: string;
  onboarding_started: boolean;
  personal_info_complete: boolean;
  work_experience: unknown;
  joined_via?: string | null;
};

export function employeeFromRow(r: PersonRow): Employee {
  return {
    id: r.id,
    name: `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim(),
    firstName: r.first_name ?? undefined,
    lastName: r.last_name ?? undefined,
    email: r.email ?? "",
    phone: r.phone ?? undefined,
    primaryRole: (r.primary_role ?? "") as Role,
    approvedRoles: (r.approved_roles ?? []) as Role[],
    autoApproveRoles: (r.auto_approve_roles ?? []) as Role[],
    availability: "",
    weeklyAvailability: (r.weekly_availability as WeeklyAvailability | null) ?? undefined,
    emergencyContact: (r.emergency_contact as EmergencyContact | null) ?? undefined,
    invitedAt: r.invited_at ?? r.created_at,
    onboardingStarted: r.onboarding_started,
    personalInfoComplete: r.personal_info_complete,
    progress: [],
    hiredFromApplicationId: undefined,
    applicationPitch: undefined,
    appliedAt: undefined,
    workExperience: (r.work_experience as WorkExperience[] | null) ?? undefined,
    state: r.state,
    joinStatus: r.state === "pending_approval" ? "pending" : "active",
    joinedVia: r.joined_via ?? undefined,
  };
}

/** Owner/manager approves a pending self-join. */
export async function approveEmployeeRow(id: string): Promise<void> {
  const { error } = await supabase.rpc("approve_pending_person" as never, {
    p_person_id: id,
  } as never);
  if (error) throw error;
}


/** Build the DB-shaped payload from an Employee. */
function employeeToInsert(ownerId: string, e: Employee, opts?: { localId?: string | null }) {
  return {
    owner_id: ownerId,
    local_id: opts?.localId ?? null,
    name: e.name,
    first_name: e.firstName ?? null,
    last_name: e.lastName ?? null,
    email: e.email || null,
    phone: e.phone ?? null,
    primary_role: e.primaryRole,
    approved_roles: e.approvedRoles ?? [],
    auto_approve_roles: e.autoApproveRoles ?? [],
    availability: e.availability ?? "",
    weekly_availability: (e.weeklyAvailability ?? null) as never,
    emergency_contact: (e.emergencyContact ?? null) as never,
    invited_at: e.invitedAt,
    onboarding_started: e.onboardingStarted,
    personal_info_complete: e.personalInfoComplete,
    hired_from_application_id: e.hiredFromApplicationId ?? null,
    application_pitch: e.applicationPitch ?? null,
    applied_at: e.appliedAt ?? null,
    work_experience: (e.workExperience ?? null) as never,
  };
}

/** True only when an authenticated Supabase session exists in this browser. */
export async function hasSupabaseSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return Boolean(data?.session);
}

/** Owner-scoped: fetch every employee. */
export async function fetchOwnerEmployees(ownerId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("archived", false)
    .in("state", ["hired", "active", "inactive", "pending_approval"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => employeeFromRow(r as unknown as PersonRow));
}

/**
 * Insert one employee. Still targets restaurant_employees (deliberate — the hire
 * path has not migrated yet), so it maps that row shape locally.
 */
export async function insertEmployee(
  ownerId: string,
  e: Employee,
  opts?: { localId?: string | null },
): Promise<Employee> {
  const { data, error } = await supabase
    .from("restaurant_employees")
    .insert(employeeToInsert(ownerId, e, opts))
    .select("*")
    .single();
  if (error) throw error;
  const r = data as Record<string, unknown>;
  return {
    ...e,
    id: String(r.id),
    joinStatus: r.join_status === "active" ? "active" : "pending",
  };
}


/** Patch by id. Maps camelCase → snake_case for the fields callers actually change. */
export async function updateEmployeeRow(id: string, patch: Partial<Employee>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.firstName !== undefined) row.first_name = patch.firstName ?? "";
  if (patch.lastName !== undefined) row.last_name = patch.lastName ?? "";
  if (patch.email !== undefined) row.email = patch.email || null;
  if (patch.phone !== undefined) row.phone = patch.phone ?? null;
  if (patch.primaryRole !== undefined) row.primary_role = patch.primaryRole;
  if (patch.approvedRoles !== undefined) row.approved_roles = patch.approvedRoles;
  if (patch.autoApproveRoles !== undefined) row.auto_approve_roles = patch.autoApproveRoles;
  if (patch.weeklyAvailability !== undefined) row.weekly_availability = patch.weeklyAvailability as unknown;
  if (patch.emergencyContact !== undefined) row.emergency_contact = patch.emergencyContact as unknown;
  if (patch.onboardingStarted !== undefined) row.onboarding_started = patch.onboardingStarted;
  if (patch.personalInfoComplete !== undefined) row.personal_info_complete = patch.personalInfoComplete;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from("people")
    .update(row as never)
    .eq("id", id);
  if (error) throw error;
}

/**
 * Removes a person from the roster. A pending self-join is declined through the
 * RPC (keeps the audit state); anyone else is deleted outright.
 */
export async function deleteEmployeeRow(id: string): Promise<void> {
  const { data } = await supabase
    .from("people")
    .select("state")
    .eq("id", id)
    .maybeSingle();
  const state = (data as { state?: string } | null)?.state;
  if (state === "pending_approval") {
    const { error } = await supabase.rpc("decline_pending_person" as never, {
      p_person_id: id,
    } as never);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("people").delete().eq("id", id);
  if (error) throw error;
}

/** Mark a person inactive: they drop off the schedule but keep their record. */
export async function archiveEmployeeRow(id: string): Promise<void> {
  const { error } = await supabase.from("people").update({ state: "inactive" }).eq("id", id);
  if (error) throw error;
}

/** Bring an archived person back onto the active roster. */
export async function reactivateEmployeeRow(id: string): Promise<void> {
  const { error } = await supabase.from("people").update({ state: "active" }).eq("id", id);
  if (error) throw error;
}

export async function deleteAllOwnerEmployees(ownerId: string): Promise<void> {
  // `people` also holds the hiring pipeline (applicants, interviewing, shadow,
  // rejected). Clearing the roster must never wipe those rows.
  const { error } = await supabase
    .from("people")
    .delete()
    .eq("owner_id", ownerId)
    .in("state", ["active", "inactive", "pending_approval", "hired"]);
  if (error) throw error;
}


/** Dead localStorage-migration machinery. `people` has no local_id column. */
export async function bootstrapLocalEmployees(
  _ownerId: string,
  _locals: Employee[],
): Promise<Employee[]> {
  return [];
}

/* ---------------- Restaurant hours (jsonb on profiles) ---------------- */

export async function fetchRestaurantHours(ownerId: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("restaurant_hours")
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data as { restaurant_hours: unknown } | null)?.restaurant_hours ?? null;
}

export async function saveRestaurantHours(ownerId: string, hours: unknown): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ restaurant_hours: hours as never })
    .eq("id", ownerId);
  if (error) throw error;
}

/* ---------------- Business info (jsonb on profiles) ---------------- */

export async function fetchBusinessInfo(ownerId: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("business_info" as never)
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data as { business_info: unknown } | null)?.business_info ?? null;
}

export async function saveBusinessInfo(ownerId: string, info: unknown): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ business_info: info as never } as never)
    .eq("id", ownerId);
  if (error) throw error;
}

/* ---------------- Role configuration (jsonb on profiles) ---------------- */

/**
 * Fail-open normalizer: anything malformed becomes `[]`, which means
 * "no built-in role is disabled" — never the reverse.
 */
export function normalizeDisabledRoles(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/**
 * Fail-open normalizer for owner-authored custom roles. Entries missing a
 * usable name or section are dropped; a missing color is assigned rather than
 * costing the owner the role.
 */
export function normalizeCustomRoles(raw: unknown): CustomRole[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomRole[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const section = e.section === "FOH" || e.section === "BOH" ? e.section : null;
    if (!name || !section) continue;
    const color = typeof e.color === "string" && e.color.trim() ? e.color : nextCustomColor(out);
    out.push({ name, section, color });
  }
  return out;
}

/**
 * `everWritten` is true if and only if the stored value is non-NULL. It is
 * NEVER derived from array length: `[]` is a legitimate saved state ("we
 * configured roles and disabled nothing"), and it is what most restaurants
 * will hold. Inferring "never written" from "empty" let a stale local cache
 * resurrect roles the owner had already re-enabled.
 *
 *   NULL = never configured   |   [] = configured, nothing disabled
 *
 * A missing profile row and a row with NULL columns both mean "not
 * configured"; neither is an error. The normalizers still fail open, so the
 * arrays handed back are safe to use no matter what was stored.
 */
export async function fetchRoleConfig(
  ownerId: string,
): Promise<{ disabledRoles: string[]; customRoles: CustomRole[]; everWritten: boolean }> {
  const { data, error } = await supabase
    .from("profiles")
    .select("disabled_roles, custom_roles" as never)
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;

  // No profile row at all -> not configured, and not a crash.
  const row = data as { disabled_roles: unknown; custom_roles: unknown } | null;

  // Non-null in the database is the ONLY signal that a save has happened.
  const stored = (v: unknown) => v !== null && v !== undefined;
  const everWritten = row !== null && (stored(row.disabled_roles) || stored(row.custom_roles));


  return {
    // Fail open regardless: NULL, malformed, or non-array all become [],
    // which means "no built-in role is disabled" — never the reverse.
    disabledRoles: normalizeDisabledRoles(row?.disabled_roles),
    customRoles: normalizeCustomRoles(row?.custom_roles),
    everWritten,
  };
}

/**
 * Always writes real arrays, never NULL — saving is what makes a row
 * "configured". Asks for the affected-row count and throws when it is zero:
 * an `.update()` against a missing profile row otherwise reports success
 * while doing nothing at all.
 */
export async function saveRoleConfig(
  ownerId: string,
  disabledRoles: string[],
  customRoles: CustomRole[],
): Promise<void> {
  const { error, count } = await supabase
    .from("profiles")
    .update(
      {
        disabled_roles: normalizeDisabledRoles(disabledRoles) as never,
        custom_roles: normalizeCustomRoles(customRoles) as never,
      } as never,
      { count: "exact" },
    )
    .eq("id", ownerId);
  if (error) throw error;
  if (!count) {
    throw new Error(`saveRoleConfig: no profile row updated for owner ${ownerId}`);
  }
}



/* ---------------- Shadow shift packet (jsonb on profiles) ---------------- */

// Fallback rule for the resolver that will eventually consume this packet:
// - Role is Host -> use dress.host; if both of its fields are empty, fall back to dress.foh.
// - Role is any other front of house role -> use dress.foh.
// - Role is a back of house role -> use dress.boh.
// The resolver does not exist yet; this comment records the rule next to the data.

export type ShadowDressSection = { wear: string; provided: string };

export type ShadowPacket = {
  entrance: string;
  /** Optional BOH-only entrance override. Blank means everyone uses `entrance`. */
  entranceBoh: string;
  parking: string;
  /**
   * Stable, per-restaurant answer to "who do I ask for when I arrive" —
   * holds whoever is training, including when the shift's trainer is
   * "Assign later" or the assigned trainer calls out.
   */
  askFor: string;
  dress: {
    foh: ShadowDressSection;
    host: ShadowDressSection;
    boh: ShadowDressSection;
  };
  /** What to bring. No cross-fallback: blank boh means "nothing special". */
  bring: { foh: string; boh: string };
  /** One optional line per role, keyed by role name. */
  doing: Record<string, string>;
  /**
   * Explicit per-role dress group overrides, keyed by role name.
   * Only roles the owner deliberately changed are stored; anything absent
   * falls back to the derived default in shadow-packet-roles.ts.
   */
  dressGroup: Record<string, "foh" | "host" | "boh">;
};

export function emptyShadowPacket(): ShadowPacket {
  return {
    entrance: "",
    entranceBoh: "",
    parking: "",
    askFor: "",
    dress: {
      foh: { wear: "", provided: "" },
      host: { wear: "", provided: "" },
      boh: { wear: "", provided: "" },
    },
    bring: { foh: "", boh: "" },
    doing: {},
    dressGroup: {},
  };
}

/** Normalize whatever is stored (partial/null) into the full shape with empty strings. */
export function normalizeShadowPacket(raw: unknown): ShadowPacket {
  const base = emptyShadowPacket();
  if (!raw || typeof raw !== "object") return base;
  const r = raw as Record<string, unknown>;
  const dress = (r.dress ?? {}) as Record<string, unknown>;
  const bring = (r.bring ?? {}) as Record<string, unknown>;
  const sect = (v: unknown): ShadowDressSection => {
    const s = (v ?? {}) as Record<string, unknown>;
    return {
      wear: typeof s.wear === "string" ? s.wear : "",
      provided: typeof s.provided === "string" ? s.provided : "",
    };
  };
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const doing: Record<string, string> = {};
  if (r.doing && typeof r.doing === "object") {
    for (const [k, v] of Object.entries(r.doing as Record<string, unknown>)) {
      if (typeof v === "string") doing[k] = v;
    }
  }
  const dressGroup: Record<string, "foh" | "host" | "boh"> = {};
  if (r.dressGroup && typeof r.dressGroup === "object") {
    for (const [k, v] of Object.entries(r.dressGroup as Record<string, unknown>)) {
      if (v === "foh" || v === "host" || v === "boh") dressGroup[k] = v;
    }
  }
  return {
    entrance: str(r.entrance),
    entranceBoh: str(r.entranceBoh),
    parking: str(r.parking),
    // Rows predating this field have no key: str(undefined) fails open to "".
    askFor: str(r.askFor),
    dress: { foh: sect(dress.foh), host: sect(dress.host), boh: sect(dress.boh) },
    bring: { foh: str(bring.foh), boh: str(bring.boh) },
    doing,
    dressGroup,
  };
}


export async function fetchShadowPacket(ownerId: string): Promise<ShadowPacket> {
  const { data, error } = await supabase
    .from("profiles")
    .select("shadow_packet" as never)
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return normalizeShadowPacket((data as { shadow_packet: unknown } | null)?.shadow_packet ?? null);
}

export async function saveShadowPacket(ownerId: string, packet: ShadowPacket): Promise<void> {
  // Mirror saveRoleConfig: ask for the exact affected-row count and throw when
  // it is zero, so an update against a missing profile row can't report success.
  const { error, count } = await supabase
    .from("profiles")
    .update({ shadow_packet: packet as never } as never, { count: "exact" })
    .eq("id", ownerId);
  if (error) throw error;
  if (!count) {
    throw new Error(`saveShadowPacket: no profile row updated for owner ${ownerId}`);
  }
}

/* ---------------- Per-role menu test config (jsonb on profiles) ---------------- */

/** Owner-side read (RLS: owner reads their own profile row). */
export async function fetchMenuTestConfig(ownerId: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("menu_test_config" as never)
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return (data as { menu_test_config: unknown } | null)?.menu_test_config ?? null;
}

/** Employee-side read via security-definer RPC (staff can't select the owner profile row). */
export async function fetchMenuTestConfigViaRpc(ownerId: string): Promise<unknown | null> {
  const { data, error } = await (supabase as never as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc("get_menu_test_config", { p_owner_id: ownerId });
  if (error) throw error;
  return data ?? null;
}

export async function saveMenuTestConfig(ownerId: string, config: unknown): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ menu_test_config: config as never } as never)
    .eq("id", ownerId);
  if (error) throw error;
}



/* ---------------- Staff-invite tokens (self-serve profile fill) ---------------- */

/**
 * Owner creates a stub employee row carrying an invite_token. The invitee then
 * loads /staff-invite/:token to complete their own details and claim the row.
 * Returns the new employee id and the invite token.
 */
export async function createStaffInviteRow(
  ownerId: string,
  seed: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: Role;
  },
): Promise<{ id: string; inviteToken: string; matchedExisting: boolean }> {
  const { data, error } = await supabase.rpc("create_person_invite" as never, {
    p_owner_id: ownerId,
    p_first_name: seed.firstName,
    p_last_name: seed.lastName,
    p_email: seed.email || null,
    p_phone: seed.phone || null,
    p_primary_role: seed.role,
  } as never);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | { person_id: string; invite_token: string; matched_existing: boolean }
    | undefined;
  if (!row) throw new Error("Invite could not be created");
  return {
    id: row.person_id,
    inviteToken: row.invite_token,
    matchedExisting: Boolean(row.matched_existing),
  };
}

export type PublicStaffInviteInfo = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  primaryRole: string | null;
  restaurantName: string | null;
  expired: boolean;
  claimed: boolean;
};

export async function fetchPublicStaffInvite(
  token: string,
): Promise<PublicStaffInviteInfo | null> {
  const { data, error } = await supabase.rpc("get_public_person_invite" as never, {
    p_token: token,
  } as never);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : null) as
    | {
        first_name: string | null;
        last_name: string | null;
        email: string | null;
        phone: string | null;
        primary_role: string | null;
        restaurant_name: string | null;
        expired: boolean;
        claimed: boolean;
      }
    | null;
  if (!row) return null;
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    primaryRole: row.primary_role,
    restaurantName: row.restaurant_name,
    expired: Boolean(row.expired),
    claimed: Boolean(row.claimed),
  };
}

/**
 * Claims the invite for the signed-in user (the RPC reads auth.uid()), then
 * writes the self-editable fields. First/last name and role are manager-owned
 * and are rejected by the database guard, so they are never sent.
 */
export async function claimStaffInvite(
  token: string,
  patch: {
    email?: string;
    phone?: string;
    weekly_availability?: unknown;
    emergency_contact?: unknown;
  },
): Promise<string> {
  const { data, error } = await supabase.rpc("claim_person_invite" as never, {
    p_token: token,
  } as never);
  if (error) throw error;
  const personId = typeof data === "string" ? data : (data as { id?: string } | null)?.id;
  if (typeof personId !== "string" || personId.length === 0) {
    throw new Error("Couldn't finish claiming this invite. Please ask your manager to send a new link.");
  }

  const cleanEmail = patch.email?.trim().toLowerCase();
  const hasSelfFields =
    (cleanEmail !== undefined && cleanEmail !== "") ||
    patch.phone !== undefined ||
    patch.weekly_availability !== undefined ||
    patch.emergency_contact !== undefined;
  if (hasSelfFields) {

    const row: Record<string, unknown> = { personal_info_complete: true };
    // The person owns their own email: blank leaves the stored value alone.
    if (cleanEmail) row.email = cleanEmail;
    if (patch.phone !== undefined) row.phone = patch.phone || null;
    if (patch.weekly_availability !== undefined) row.weekly_availability = patch.weekly_availability;
    if (patch.emergency_contact !== undefined) row.emergency_contact = patch.emergency_contact;
    const { error: upErr } = await supabase.from("people").update(row as never).eq("id", personId);
    if (upErr) throw upErr;
  }
  return personId;
}
