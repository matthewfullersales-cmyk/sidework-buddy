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
export type PublicInterview = {
  id: string;
  interviewType: InterviewType;
  offeredSlots: string[];
  selectedSlot: string | null;
  status: InterviewStatus;
  firstName: string | null;
  restaurantName: string | null;
  address: string | null;
  restaurantPhone: string | null;
};

type PublicInterviewRow = {
  id: string;
  interview_type: string;
  offered_slots: string[] | null;
  selected_slot: string | null;
  status: string;
  first_name: string | null;
  restaurant_name: string | null;
  address: string | null;
  restaurant_phone: string | null;
};

function mapPublic(row: PublicInterviewRow): PublicInterview {
  return {
    id: row.id,
    interviewType: (row.interview_type as InterviewType) ?? "phone",
    offeredSlots: row.offered_slots ?? [],
    selectedSlot: row.selected_slot,
    status: (row.status as InterviewStatus) ?? "offered",
    firstName: row.first_name,
    restaurantName: row.restaurant_name,
    address: row.address,
    restaurantPhone: row.restaurant_phone,
  };
}

/** Manager-only. Cancels any outstanding interview and moves the person to `interviewing`. */
export async function createInterviewOffer(
  personId: string,
  type: InterviewType,
  slotsIso: string[],
): Promise<Interview> {
  const { data, error } = await supabase.rpc("create_interview_offer", {
    p_person_id: personId,
    p_type: type,
    p_slots: slotsIso,
  });
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

export async function confirmInterviewSlot(token: string, slotIso: string): Promise<PublicInterview | null> {
  const { data, error } = await supabase.rpc("confirm_interview_slot", {
    p_token: token,
    p_slot: slotIso,
  });
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
