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

type EmployeeRow = {
  id: string;
  owner_id: string;
  auth_user_id: string | null;
  local_id: string | null;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  position: string | null;
  section: string | null;
  primary_role: string;
  approved_roles: string[];
  auto_approve_roles: string[];
  seniority: number | null;
  availability: string;
  weekly_availability: unknown;
  emergency_contact: unknown;
  photo_url: string | null;
  invited_at: string;
  onboarding_started: boolean;
  personal_info_complete: boolean;
  hired_from_application_id: string | null;
  application_pitch: string | null;
  applied_at: string | null;
  work_experience: unknown;
  special_talents: string | null;
};

export function employeeFromRow(r: EmployeeRow): Employee {
  return {
    id: r.id,
    name: r.name,
    firstName: r.first_name ?? undefined,
    lastName: r.last_name ?? undefined,
    email: r.email ?? "",
    phone: r.phone ?? undefined,
    primaryRole: r.primary_role as Role,
    approvedRoles: (r.approved_roles ?? []) as Role[],
    autoApproveRoles: (r.auto_approve_roles ?? []) as Role[],
    availability: r.availability ?? "",
    weeklyAvailability: (r.weekly_availability as WeeklyAvailability | null) ?? undefined,
    emergencyContact: (r.emergency_contact as EmergencyContact | null) ?? undefined,
    photoUrl: r.photo_url ?? undefined,
    invitedAt: r.invited_at,
    onboardingStarted: r.onboarding_started,
    personalInfoComplete: r.personal_info_complete,
    progress: [], // training progress stays local in Wave A
    position: (r.position as Position | null) ?? undefined,
    section: (r.section as Section | null) ?? undefined,
    seniority: r.seniority ?? undefined,
    hiredFromApplicationId: r.hired_from_application_id ?? undefined,
    applicationPitch: r.application_pitch ?? undefined,
    appliedAt: r.applied_at ?? undefined,
    workExperience: (r.work_experience as WorkExperience[] | null) ?? undefined,
    specialTalents: r.special_talents ?? undefined,
  };
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

/** Owner-scoped: fetch every employee. */
export async function fetchOwnerEmployees(ownerId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from("restaurant_employees")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => employeeFromRow(r as EmployeeRow));
}

/** Insert one employee. Returns the new row (with the DB-assigned uuid). */
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
  return employeeFromRow(data as EmployeeRow);
}

/** Patch by id. Maps camelCase → snake_case for the fields callers actually change. */
export async function updateEmployeeRow(id: string, patch: Partial<Employee>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.firstName !== undefined) row.first_name = patch.firstName ?? null;
  if (patch.lastName !== undefined) row.last_name = patch.lastName ?? null;
  if (patch.email !== undefined) row.email = patch.email || null;
  if (patch.phone !== undefined) row.phone = patch.phone ?? null;
  if (patch.position !== undefined) row.position = patch.position ?? null;
  if (patch.section !== undefined) row.section = patch.section ?? null;
  if (patch.primaryRole !== undefined) row.primary_role = patch.primaryRole;
  if (patch.approvedRoles !== undefined) row.approved_roles = patch.approvedRoles;
  if (patch.autoApproveRoles !== undefined) row.auto_approve_roles = patch.autoApproveRoles;
  if (patch.seniority !== undefined) row.seniority = patch.seniority ?? null;
  if (patch.availability !== undefined) row.availability = patch.availability ?? "";
  if (patch.weeklyAvailability !== undefined) row.weekly_availability = patch.weeklyAvailability as unknown;
  if (patch.emergencyContact !== undefined) row.emergency_contact = patch.emergencyContact as unknown;
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl ?? null;
  if (patch.onboardingStarted !== undefined) row.onboarding_started = patch.onboardingStarted;
  if (patch.personalInfoComplete !== undefined) row.personal_info_complete = patch.personalInfoComplete;
  if (patch.specialTalents !== undefined) row.special_talents = patch.specialTalents ?? null;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase
    .from("restaurant_employees")
    .update(row as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteEmployeeRow(id: string): Promise<void> {
  const { error } = await supabase.from("restaurant_employees").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteAllOwnerEmployees(ownerId: string): Promise<void> {
  const { error } = await supabase
    .from("restaurant_employees")
    .delete()
    .eq("owner_id", ownerId);
  if (error) throw error;
}

/**
 * One-time bootstrap: upload any local employees the owner has to Supabase.
 * Idempotent via UNIQUE(owner_id, local_id) — repeat calls are no-ops.
 * Returns the freshly-fetched authoritative list from Supabase after upload.
 */
export async function bootstrapLocalEmployees(
  ownerId: string,
  locals: Employee[],
): Promise<Employee[]> {
  // Public/signed-out pages must never issue any roster request.
  if (!(await hasSupabaseSession())) return [];
  if (locals.length === 0) return [];
  const rows = locals.map((e) => employeeToInsert(ownerId, e, { localId: e.id }));
  const { error } = await supabase
    .from("restaurant_employees")
    .upsert(rows, { onConflict: "owner_id,local_id", ignoreDuplicates: true });
  if (error) throw error;
  return fetchOwnerEmployees(ownerId);
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
    localId: string;
  },
): Promise<{ id: string; inviteToken: string }> {
  const fullName = `${seed.firstName} ${seed.lastName}`.trim();
  const inviteToken = crypto.randomUUID();
  const insert = {
    owner_id: ownerId,
    local_id: seed.localId,
    name: fullName || seed.email || "New staff",
    first_name: seed.firstName || null,
    last_name: seed.lastName || null,
    email: seed.email || null,
    phone: seed.phone || null,
    primary_role: seed.role,
    approved_roles: [seed.role],
    auto_approve_roles: [],
    availability: "",
    weekly_availability: null as never,
    emergency_contact: null as never,
    invited_at: new Date().toISOString().slice(0, 10),
    onboarding_started: false,
    personal_info_complete: false,
    invite_token: inviteToken,
  };
  const { data, error } = await supabase
    .from("restaurant_employees")
    .insert(insert as never)
    .select("id, invite_token")
    .single();
  if (error) throw error;
  const row = data as { id: string; invite_token: string };
  return { id: row.id, inviteToken: row.invite_token };
}

export type PublicStaffInviteInfo = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  primaryRole: string;
  restaurantName: string | null;
  claimed: boolean;
};

export async function fetchPublicStaffInvite(
  token: string,
): Promise<PublicStaffInviteInfo | null> {
  const { data, error } = await supabase.rpc("get_public_employee_invite", {
    p_token: token,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name,
    email: row.email,
    phone: row.phone,
    primaryRole: row.primary_role,
    restaurantName: row.restaurant_name,
    claimed: row.claimed,
  };
}

export async function claimStaffInvite(
  token: string,
  authUserId: string,
  patch: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    primary_role?: string;
    weekly_availability?: unknown;
    emergency_contact?: unknown;
  },
): Promise<void> {
  const { error } = await supabase.rpc("claim_employee_invite", {
    p_token: token,
    p_auth_user_id: authUserId,
    p_patch: patch as never,
  });
  if (error) throw error;
}

