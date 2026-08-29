// Data-access helpers for the unified person record (public.people).
// One row per person for their entire lifecycle: applicant -> active/inactive.
// Managers read/write their own restaurant's rows; a person with a login can
// read their own row and edit only phone / email / emergency contact.
import { supabase } from "@/integrations/supabase/client";

export type PersonState =
  | "applicant"
  | "interviewing"
  | "shadow"
  | "hired"
  | "active"
  | "inactive"
  | "rejected";

export const PERSON_STATES: PersonState[] = [
  "applicant",
  "interviewing",
  "shadow",
  "hired",
  "active",
  "inactive",
  "rejected",
];

export type EmergencyContact = {
  name?: string;
  relationship?: string;
  phone?: string;
};

export type Person = {
  id: string;
  ownerId: string;
  authUserId: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  state: PersonState;
  stateChangedAt: string;
  jobId: string | null;
  source: string | null;
  appliedAt: string | null;
  hiredAt: string | null;
  primaryRole: string | null;
  approvedRoles: string[];
  autoApproveRoles: string[];
  isTrainerForRoles: string[];
  emergencyContact: EmergencyContact | null;
  resumePath: string | null;
  workExperience: unknown;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

type PersonRow = {
  id: string;
  owner_id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  state: string;
  state_changed_at: string;
  job_id: string | null;
  source: string | null;
  applied_at: string | null;
  hired_at: string | null;
  primary_role: string | null;
  approved_roles: string[];
  auto_approve_roles: string[];
  is_trainer_for_roles: string[];
  emergency_contact: unknown;
  resume_path: string | null;
  work_experience: unknown;
  archived: boolean;
  created_at: string;
  updated_at: string;
};

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    ownerId: row.owner_id,
    authUserId: row.auth_user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    state: (row.state as PersonState) ?? "applicant",
    stateChangedAt: row.state_changed_at,
    jobId: row.job_id,
    source: row.source,
    appliedAt: row.applied_at,
    hiredAt: row.hired_at,
    primaryRole: row.primary_role,
    approvedRoles: row.approved_roles ?? [],
    autoApproveRoles: row.auto_approve_roles ?? [],
    isTrainerForRoles: row.is_trainer_for_roles ?? [],
    emergencyContact: (row.emergency_contact as EmergencyContact | null) ?? null,
    resumePath: row.resume_path,
    workExperience: row.work_experience ?? null,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type NewPerson = {
  ownerId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  state?: PersonState;
  jobId?: string | null;
  source?: string | null;
  primaryRole?: string | null;
  approvedRoles?: string[];
  autoApproveRoles?: string[];
  isTrainerForRoles?: string[];
  emergencyContact?: EmergencyContact | null;
  resumePath?: string | null;
  workExperience?: unknown;
  appliedAt?: string | null;
};

/** Manager-side create (walk-ins, manager-added staff). Public intake uses submitApplication. */
export async function insertPerson(data: NewPerson): Promise<Person> {
  const { data: row, error } = await supabase
    .from("people")
    .insert({
      owner_id: data.ownerId,
      first_name: data.firstName.trim(),
      last_name: data.lastName.trim(),
      email: data.email?.trim() || null,
      phone: data.phone?.trim() || null,
      state: data.state ?? "applicant",
      job_id: data.jobId ?? null,
      source: data.source ?? null,
      primary_role: data.primaryRole ?? null,
      approved_roles: data.approvedRoles ?? [],
      auto_approve_roles: data.autoApproveRoles ?? [],
      is_trainer_for_roles: data.isTrainerForRoles ?? [],
      emergency_contact: (data.emergencyContact ?? null) as never,
      resume_path: data.resumePath ?? null,
      work_experience: (data.workExperience ?? null) as never,
      applied_at: data.appliedAt ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapPerson(row as PersonRow);
}

export async function fetchPeople(
  ownerId: string,
  opts: { states?: PersonState[]; archived?: boolean } = {},
): Promise<Person[]> {
  let query = supabase.from("people").select("*").eq("owner_id", ownerId);
  if (opts.states && opts.states.length > 0) query = query.in("state", opts.states);
  if (typeof opts.archived === "boolean") query = query.eq("archived", opts.archived);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as PersonRow[]).map(mapPerson);
}

export async function fetchPersonById(id: string): Promise<Person | null> {
  const { data, error } = await supabase.from("people").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? mapPerson(data as PersonRow) : null;
}

/** Non-privileged field updates. State and role fields are intentionally excluded. */
export type PersonPatch = Partial<{
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  emergencyContact: EmergencyContact | null;
  resumePath: string | null;
  workExperience: unknown;
  source: string | null;
  jobId: string | null;
}>;

export async function updatePerson(id: string, patch: PersonPatch): Promise<Person> {
  const row: Record<string, unknown> = {};
  if (patch.firstName !== undefined) row.first_name = patch.firstName.trim();
  if (patch.lastName !== undefined) row.last_name = patch.lastName.trim();
  if (patch.email !== undefined) row.email = patch.email?.trim() || null;
  if (patch.phone !== undefined) row.phone = patch.phone?.trim() || null;
  if (patch.emergencyContact !== undefined) row.emergency_contact = patch.emergencyContact;
  if (patch.resumePath !== undefined) row.resume_path = patch.resumePath;
  if (patch.workExperience !== undefined) row.work_experience = patch.workExperience;
  if (patch.source !== undefined) row.source = patch.source;
  if (patch.jobId !== undefined) row.job_id = patch.jobId;

  const { data, error } = await supabase
    .from("people")
    .update(row as never)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapPerson(data as PersonRow);
}

/** Manager-only lifecycle change; authorization is enforced inside the RPC. */
export async function setPersonState(id: string, state: PersonState): Promise<Person> {
  const { data, error } = await supabase.rpc("set_person_state", {
    p_person_id: id,
    p_new_state: state,
  });
  if (error) throw error;
  return mapPerson(data as unknown as PersonRow);
}

export async function archivePerson(id: string, archived = true): Promise<Person> {
  const { data, error } = await supabase
    .from("people")
    .update({ archived })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapPerson(data as PersonRow);
}

/** Public, unauthenticated application intake. Returns the new person id. */
export async function submitApplication(input: {
  ownerSlug?: string | null;
  jobId?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
}): Promise<string> {
  const { data, error } = await supabase.rpc("submit_application", {
    p_owner_slug: input.ownerSlug ?? "",
    p_job_id: (input.jobId ?? null) as unknown as string,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_email: input.email ?? "",
    p_phone: input.phone ?? "",
    p_source: input.source ?? "careers",
  });
  if (error) throw error;
  return data as unknown as string;
}
