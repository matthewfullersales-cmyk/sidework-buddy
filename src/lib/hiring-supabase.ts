// Data-access helpers for the hiring pipeline (job_postings + job_applications).
// Postings are publicly readable; only the authenticated owner can mutate.
// Applications can be inserted by any visitor; only the owner can read/update/delete.
import { supabase } from "@/integrations/supabase/client";
import type {
  JobPosting,
  JobApplication,
  Role,
  ApplicationStatus,
  HiringStage,
  AiScore,
  ApplicationSource,
  InterviewType,
  ShadowShiftDetails,
  WeeklyAvailability,
  WorkExperience,
} from "@/lib/sidework-store";

type PostingRow = {
  id: string;
  owner_id: string;
  title: string;
  role: string;
  type: string;
  pay_range: string;
  description: string;
  posted_at: string;
  open: boolean;
};

type ApplicationRow = {
  id: string;
  owner_id: string;
  job_id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string;
  role: string | null;
  pitch: string | null;
  source: string | null;
  weekly_availability: unknown;
  availability_days: string[];
  availability_hours: string;
  note: string | null;
  applied_at: string;
  status: string;
  stage: string | null;
  verified: boolean;
  ai_score: string | null;
  interview_sent_at: string | null;
  interview_notes: string | null;
  interview_type: string | null;
  offered_slots: string[] | null;
  selected_slot: string | null;
  shadow_shift: unknown;
  archived: boolean;
  hired_employee_id: string | null;
  work_experience: unknown;
  special_talents: string | null;
  assigned_to: string | null;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
};

export type PublicInterviewInfo = {
  id: string;
  firstName: string | null;
  name: string;
  phone: string;
  role: string | null;
  stage: string | null;
  interviewType: string | null;
  offeredSlots: string[] | null;
  selectedSlot: string | null;
  interviewNotes: string | null;
  restaurantName: string | null;
  jobTitle: string | null;
  assigneeName: string | null;
  assigneeEmail: string | null;
  assigneePhone: string | null;
};

export function postingFromRow(r: PostingRow): JobPosting {
  return {
    id: r.id,
    title: r.title,
    role: r.role as Role,
    type: r.type as JobPosting["type"],
    payRange: r.pay_range,
    description: r.description,
    postedAt: r.posted_at,
    open: r.open,
  };
}

export function applicationFromRow(r: ApplicationRow): JobApplication {
  return {
    id: r.id,
    jobId: r.job_id,
    name: r.name,
    firstName: r.first_name ?? undefined,
    lastName: r.last_name ?? undefined,
    email: r.email ?? undefined,
    phone: r.phone,
    role: (r.role as Role) ?? undefined,
    pitch: r.pitch ?? undefined,
    source: (r.source as ApplicationSource) ?? undefined,
    weeklyAvailability: (r.weekly_availability as WeeklyAvailability | null) ?? undefined,
    availabilityDays: r.availability_days ?? [],
    availabilityHours: r.availability_hours as JobApplication["availabilityHours"],
    note: r.note ?? undefined,
    appliedAt: r.applied_at,
    status: r.status as ApplicationStatus,
    stage: (r.stage as HiringStage) ?? undefined,
    verified: r.verified,
    aiScore: (r.ai_score as AiScore) ?? undefined,
    interviewSentAt: r.interview_sent_at ?? undefined,
    interviewNotes: r.interview_notes ?? undefined,
    interviewType: (r.interview_type as InterviewType) ?? undefined,
    offeredSlots: r.offered_slots ?? undefined,
    selectedSlot: r.selected_slot ?? undefined,
    shadowShift: (r.shadow_shift as ShadowShiftDetails | null) ?? undefined,
    archived: r.archived,
    hiredEmployeeId: r.hired_employee_id ?? undefined,
    workExperience: (r.work_experience as WorkExperience[] | null) ?? undefined,
    specialTalents: r.special_talents ?? undefined,
    assignedTo: r.assigned_to ?? undefined,
  };
}

/** Public: fetch a single job posting by id. */
export async function fetchPublicPosting(id: string): Promise<JobPosting | null> {
  const { data, error } = await supabase
    .from("job_postings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? postingFromRow(data as PostingRow) : null;
}

/** Owner-scoped: fetch all postings for a signed-in owner. */
export async function fetchOwnerPostings(ownerId: string): Promise<JobPosting[]> {
  const { data, error } = await supabase
    .from("job_postings")
    .select("*")
    .eq("owner_id", ownerId)
    .order("posted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => postingFromRow(r as PostingRow));
}

/** Owner-scoped: fetch all applications for a signed-in owner. */
export async function fetchOwnerApplications(ownerId: string): Promise<JobApplication[]> {
  const { data, error } = await supabase
    .from("job_applications")
    .select("*")
    .eq("owner_id", ownerId)
    .order("applied_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => applicationFromRow(r as ApplicationRow));
}

export async function insertPosting(
  ownerId: string,
  data: { title: string; role: Role; type: JobPosting["type"]; payRange: string; description: string },
): Promise<JobPosting> {
  const { data: row, error } = await supabase
    .from("job_postings")
    .insert({
      owner_id: ownerId,
      title: data.title,
      role: data.role,
      type: data.type,
      pay_range: data.payRange,
      description: data.description,
      open: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return postingFromRow(row as PostingRow);
}

export async function updatePostingOpen(id: string, open: boolean): Promise<void> {
  const { error } = await supabase.from("job_postings").update({ open }).eq("id", id);
  if (error) throw error;
}

export async function deletePosting(id: string): Promise<void> {
  const { error } = await supabase.from("job_postings").delete().eq("id", id);
  if (error) throw error;
}

/** Public: submit an application. owner_id is force-set server-side by trigger. */
export async function insertApplication(
  data: Omit<JobApplication, "id" | "appliedAt" | "status" | "aiScore"> & {
    aiScore?: AiScore;
  },
): Promise<JobApplication> {
  if (!data.jobId) throw new Error("jobId is required to submit an application");
  // Anonymous submitters can INSERT but have no SELECT policy on job_applications,
  // so we cannot use `.select().single()` to read the row back — PostgREST would
  // report "new row violates row-level security policy" from the post-insert read.
  // Generate the id client-side and build the returned JobApplication locally.
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const appliedAt = new Date().toISOString();
  const { error } = await supabase.from("job_applications").insert({
    id,
    // owner_id is required by the type but the trigger overrides it.
    owner_id: "00000000-0000-0000-0000-000000000000",
    job_id: data.jobId,
    name: data.name,
    first_name: data.firstName ?? null,
    last_name: data.lastName ?? null,
    email: data.email ?? null,
    phone: data.phone,
    role: data.role ?? null,
    pitch: data.pitch ?? null,
    source: data.source ?? null,
    weekly_availability: (data.weeklyAvailability ?? null) as never,
    availability_days: data.availabilityDays ?? [],
    availability_hours: data.availabilityHours,
    note: data.note ?? null,
    verified: data.verified,
    ai_score: data.aiScore ?? null,
    work_experience: (data.workExperience ?? null) as never,
    special_talents: data.specialTalents ?? null,
    status: "new",
    applied_at: appliedAt,
  });
  if (error) throw error;
  return {
    ...data,
    id,
    appliedAt,
    status: "new",
    verified: data.verified,
  } as JobApplication;
}


/** Owner-scoped patch. Maps camelCase fields to snake_case columns. */
export async function updateApplication(
  id: string,
  patch: Partial<JobApplication>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.stage !== undefined) row.stage = patch.stage;
  if (patch.archived !== undefined) row.archived = patch.archived;
  if (patch.verified !== undefined) row.verified = patch.verified;
  if (patch.aiScore !== undefined) row.ai_score = patch.aiScore;
  if (patch.interviewSentAt !== undefined) row.interview_sent_at = patch.interviewSentAt;
  if (patch.interviewNotes !== undefined) row.interview_notes = patch.interviewNotes;
  if (patch.interviewType !== undefined) row.interview_type = patch.interviewType;
  if (patch.offeredSlots !== undefined) row.offered_slots = patch.offeredSlots;
  if (patch.selectedSlot !== undefined) row.selected_slot = patch.selectedSlot;
  if (patch.shadowShift !== undefined) row.shadow_shift = patch.shadowShift as unknown;
  if (patch.hiredEmployeeId !== undefined) row.hired_employee_id = patch.hiredEmployeeId;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabase.from("job_applications").update(row as never).eq("id", id);
  if (error) throw error;
}

/**
 * Public: applicant confirms their chosen interview slot.
 * Anonymous visitors have no direct UPDATE on job_applications; this RPC
 * validates the transition (video_offered -> video_scheduled) and slot
 * membership server-side (SECURITY DEFINER).
 */
export async function confirmApplicantSlot(
  applicationId: string,
  slot: string,
): Promise<void> {
  const { error } = await supabase.rpc("applicant_confirm_interview_slot", {
    p_application_id: applicationId,
    p_slot: slot,
  });
  if (error) throw error;
}
