// Owner-scoped Supabase access for the employee roster.
// Wave A of the scheduling migration: employees move from localStorage to
// Supabase; shifts/time-off/trades stay local until Wave B.
import { supabase } from "@/integrations/supabase/client";
import type {
  Employee,
  Role,
  Position,
  Section,
  WeeklyAvailability,
  EmergencyContact,
  WorkExperience,
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
    photoUrl: undefined,
    invitedAt: r.invited_at ?? r.created_at,
    onboardingStarted: r.onboarding_started,
    personalInfoComplete: r.personal_info_complete,
    progress: [],
    position: undefined,
    section: undefined,
    seniority: undefined,
    hiredFromApplicationId: undefined,
    applicationPitch: undefined,
    appliedAt: undefined,
    workExperience: (r.work_experience as WorkExperience[] | null) ?? undefined,
    specialTalents: undefined,
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
    position: e.position ?? null,
    section: e.section ?? null,
    primary_role: e.primaryRole,
    approved_roles: e.approvedRoles ?? [],
    auto_approve_roles: e.autoApproveRoles ?? [],
    seniority: e.seniority ?? null,
    availability: e.availability ?? "",
    weekly_availability: (e.weeklyAvailability ?? null) as never,
    emergency_contact: (e.emergencyContact ?? null) as never,
    photo_url: e.photoUrl ?? null,
    invited_at: e.invitedAt,
    onboarding_started: e.onboardingStarted,
    personal_info_complete: e.personalInfoComplete,
    hired_from_application_id: e.hiredFromApplicationId ?? null,
    application_pitch: e.applicationPitch ?? null,
    applied_at: e.appliedAt ?? null,
    work_experience: (e.workExperience ?? null) as never,
    special_talents: e.specialTalents ?? null,
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
    .neq("state", "rejected")
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

  const hasSelfFields =
    patch.phone !== undefined ||
    patch.weekly_availability !== undefined ||
    patch.emergency_contact !== undefined;
  if (hasSelfFields) {

    const row: Record<string, unknown> = { personal_info_complete: true };
    if (patch.phone !== undefined) row.phone = patch.phone || null;
    if (patch.weekly_availability !== undefined) row.weekly_availability = patch.weekly_availability;
    if (patch.emergency_contact !== undefined) row.emergency_contact = patch.emergency_contact;
    const { error: upErr } = await supabase.from("people").update(row as never).eq("id", personId);
    if (upErr) throw upErr;
  }
  return personId;
}
