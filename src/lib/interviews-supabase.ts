// Data-access helpers for interview scheduling (public.interviews).
// Managers create offers; applicants confirm a slot through token-scoped RPCs.
// Phone and in-person only — there is no video interview option.
import { supabase } from "@/integrations/supabase/client";
import { countOpenSlotsFromToday, todayLocalISO } from "@/lib/interview-slots-supabase";
import { sendApplicantNotification } from "@/lib/applicant-notifications.functions";
import { formatDateLong, formatTime12h } from "@/lib/utils";

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
  /** Booked slot from the restaurant pool. Legacy rows have null. */
  slotId: string | null;
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
  slot_id: string | null;
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
    slotId: row.slot_id ?? null,
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
  // The server keeps one extra day either side of its own UTC date; the local
  // clock decides what "today" actually is.
  const today = todayLocalISO();
  return out.filter((s) => s.date >= today);
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

/** Who was cancelled and what they had booked — everything the email needs. */
export type CancelledInterviewInfo = {
  firstName: string | null;
  email: string | null;
  restaurantName: string | null;
  bookedDate: string | null;
  bookedTime: string | null;
};

type CancelRow = {
  first_name: string | null;
  email: string | null;
  restaurant_name: string | null;
  booked_date: string | null;
  booked_time: string | null;
};

function mapCancelled(r: CancelRow): CancelledInterviewInfo {
  return {
    firstName: r.first_name,
    email: r.email,
    restaurantName: r.restaurant_name,
    bookedDate: r.booked_date,
    bookedTime: toHHMM(r.booked_time),
  };
}

/**
 * Manager-only. Cancels the interview and releases its slot back to the pool,
 * in one transaction. Returns what the caller needs to email the candidate.
 */
export async function cancelInterview(id: string): Promise<CancelledInterviewInfo | null> {
  const { data, error } = await supabase.rpc("cancel_interview", { p_interview_id: id } as never);
  if (error) throw error;
  const rows = (data ?? []) as unknown as CancelRow[];
  return rows.length > 0 ? mapCancelled(rows[0]!) : null;
}

export type ClosedDayCandidate = CancelledInterviewInfo & { interviewId: string };

/**
 * Manager-only. Closes every open time on a date AND cancels the interviews
 * holding booked times on it (those slots close too — the day is gone).
 * Returns the candidates who must be emailed.
 */
export async function closeInterviewDay(date: string): Promise<ClosedDayCandidate[]> {
  const { data, error } = await supabase.rpc("close_interview_day", { p_date: date } as never);
  if (error) throw error;
  return ((data ?? []) as unknown as (CancelRow & { interview_id: string })[]).map((r) => ({
    interviewId: r.interview_id,
    ...mapCancelled(r),
  }));
}


/** Wall-clock date/time for booked slots, keyed by slot id. */
export async function fetchSlotTimes(slotIds: string[]): Promise<Record<string, { date: string; time: string }>> {
  const ids = Array.from(new Set(slotIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const { data, error } = await supabase
    .from("interview_slots")
    .select("id, slot_date, slot_time")
    .in("id", ids);
  if (error) throw error;
  const out: Record<string, { date: string; time: string }> = {};
  for (const r of (data ?? []) as { id: string; slot_date: string; slot_time: string }[]) {
    out[r.id] = { date: r.slot_date, time: (r.slot_time ?? "").slice(0, 5) };
  }
  return out;
}

/**
 * Shared interview_cancelled email for every cancel path (pipeline person card,
 * day-view row). Includes the booking link ONLY when open slots remain and a
 * link was supplied. Never throws — the caller reports failure; the
 * cancellation itself has already committed and must not be rolled back.
 */
export async function sendInterviewCancelledEmail(opts: {
  ownerId: string | null;
  firstName: string;
  restaurantName: string;
  email: string;
  bookedDate: string | null;
  bookedTime: string | null;
  /** Public interview link; included only when open slots remain. */
  link: string | null;
}): Promise<{ ok: boolean; attempted: boolean; error?: string }> {
  let hasOpenSlots = false;
  try {
    if (opts.ownerId) hasOpenSlots = (await countOpenSlotsFromToday(opts.ownerId)) > 0;
  } catch (e) {
    console.error("[interviews] open slot count failed", e);
  }
  const includeLink = hasOpenSlots && !!opts.link;
  try {
    const res = await sendApplicantNotification({ data: {
      kind: "interview_cancelled",
      ...(includeLink && opts.link ? { link: opts.link } : {}),
      hasOpenSlots: includeLink,
      firstName: opts.firstName,
      restaurantName: opts.restaurantName,
      email: opts.email,
      ...(opts.bookedDate ? { interviewDate: formatDateLong(opts.bookedDate) } : {}),
      ...(opts.bookedTime ? { interviewTime: formatTime12h(opts.bookedTime) } : {}),
    }});
    return { ok: res.email.ok, attempted: res.email.attempted, error: res.email.error };
  } catch (e) {
    console.error("[interviews] interview cancelled email failed", e);
    return { ok: false, attempted: true };
  }
}
