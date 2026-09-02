// Data-access helpers for interview scheduling (public.interviews).
// Managers create offers; applicants confirm a slot through token-scoped RPCs.
// Phone and in-person only — there is no video interview option.
import { supabase } from "@/integrations/supabase/client";

export type InterviewType = "phone" | "in_person";
export type InterviewStatus = "offered" | "scheduled" | "completed" | "cancelled";

export type Interview = {
  id: string;
  personId: string;
  ownerId: string;
  interviewType: InterviewType;
  offeredSlots: string[];
  selectedSlot: string | null;
  publicToken: string;
  status: InterviewStatus;
  createdAt: string;
  updatedAt: string;
};

type InterviewRow = {
  id: string;
  person_id: string;
  owner_id: string;
  interview_type: string;
  offered_slots: string[] | null;
  selected_slot: string | null;
  public_token: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function mapInterview(row: InterviewRow): Interview {
  return {
    id: row.id,
    personId: row.person_id,
    ownerId: row.owner_id,
    interviewType: (row.interview_type as InterviewType) ?? "phone",
    offeredSlots: row.offered_slots ?? [],
    selectedSlot: row.selected_slot,
    publicToken: row.public_token,
    status: (row.status as InterviewStatus) ?? "offered",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Public (token-scoped) view. Deliberately carries no applicant contact data. */
export type OpenSlot = { id: string; date: string; time: string };

export type PublicInterview = {
  id: string;
  interviewType: InterviewType;
  status: InterviewStatus;
  firstName: string | null;
  restaurantName: string | null;
  address: string | null;
  restaurantPhone: string | null;
  /** Wall-clock booked time from the slot pool. Never a timestamptz. */
  bookedDate: string | null;
  bookedTime: string | null;
  openSlots: OpenSlot[];
};

type PublicInterviewRow = {
  id: string;
  interview_type: string;
  status: string;
  first_name: string | null;
  restaurant_name: string | null;
  address: string | null;
  restaurant_phone: string | null;
  booked_date: string | null;
  booked_time: string | null;
  open_slots: unknown;
};

/** Postgres `time` comes back as HH:MM:SS; the UI works in HH:MM. */
function toHHMM(t: string | null): string | null {
  return t ? t.slice(0, 5) : null;
}

function mapOpenSlots(raw: unknown): OpenSlot[] {
  if (!Array.isArray(raw)) return [];
  const out: OpenSlot[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : null;
    const date = typeof o.slot_date === "string" ? o.slot_date : null;
    const time = typeof o.slot_time === "string" ? o.slot_time.slice(0, 5) : null;
    if (id && date && time) out.push({ id, date, time });
  }
  return out;
}

function mapPublic(row: PublicInterviewRow): PublicInterview {
  return {
    id: row.id,
    interviewType: (row.interview_type as InterviewType) ?? "phone",
    status: (row.status as InterviewStatus) ?? "offered",
    firstName: row.first_name,
    restaurantName: row.restaurant_name,
    address: row.address,
    restaurantPhone: row.restaurant_phone,
    bookedDate: row.booked_date,
    bookedTime: toHHMM(row.booked_time),
    openSlots: mapOpenSlots(row.open_slots),
  };
}

/** Manager-only. Cancels any outstanding interview and moves the person to `interviewing`. */
export async function createInterviewOffer(
  personId: string,
  type: InterviewType,
): Promise<Interview> {
  const { data, error } = await supabase.rpc("create_interview_offer", {
    p_person_id: personId,
    p_type: type,
  } as never);
  if (error) throw error;
  return mapInterview(data as unknown as InterviewRow);
}

export async function fetchInterviewsForPeople(personIds: string[]): Promise<Interview[]> {
  if (personIds.length === 0) return [];
  const { data, error } = await supabase
    .from("interviews")
    .select("*")
    .in("person_id", personIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as InterviewRow[]).map(mapInterview);
}

export async function getPublicInterview(token: string): Promise<PublicInterview | null> {
  const { data, error } = await supabase.rpc("get_public_interview_by_token", { p_token: token });
  if (error) throw error;
  const rows = (data ?? []) as unknown as PublicInterviewRow[];
  return rows.length > 0 ? mapPublic(rows[0]!) : null;
}

/** Atomic claim against the restaurant's live slot pool. Throws SLOT_TAKEN. */
export async function claimInterviewSlot(token: string, slotId: string): Promise<PublicInterview | null> {
  const { data, error } = await supabase.rpc("claim_interview_slot", {
    p_token: token,
    p_slot_id: slotId,
  } as never);
  if (error) throw error;
  const rows = (data ?? []) as unknown as PublicInterviewRow[];
  return rows.length > 0 ? mapPublic(rows[0]!) : null;
}

export async function cancelInterview(id: string): Promise<void> {
  const { error } = await supabase
    .from("interviews")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
}
