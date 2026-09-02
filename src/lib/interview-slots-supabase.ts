// Restaurant-owned interview slot pool (public.interview_slots).
//
// Wall-clock by design: a slot is a DATE plus a TIME on the restaurant's own
// clock, never a timestamptz. The older `interviews.offered_slots` model stores
// absolute instants copied onto each candidate's offer; this pool is the
// replacement, and a later pass moves the candidate page onto it. Nothing here
// touches offered_slots.
import { supabase } from "@/integrations/supabase/client";

export type InterviewSlotStatus = "open" | "booked" | "closed";

export type InterviewSlot = {
  id: string;
  ownerId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  status: InterviewSlotStatus;
  interviewId: string | null;
};

type Row = {
  id: string;
  owner_id: string;
  slot_date: string;
  slot_time: string;
  status: string;
  interview_id: string | null;
};

/** Postgres `time` comes back as HH:MM:SS; the UI works in HH:MM. */
function toHHMM(t: string): string {
  return (t ?? "").slice(0, 5);
}

function mapSlot(row: Row): InterviewSlot {
  const status = row.status as InterviewSlotStatus;
  return {
    id: row.id,
    ownerId: row.owner_id,
    date: row.slot_date,
    time: toHHMM(row.slot_time),
    // Fail open to "open" rather than crashing on an unexpected value.
    status: status === "booked" || status === "closed" ? status : "open",
    interviewId: row.interview_id,
  };
}

export async function fetchSlotsForDate(ownerId: string, date: string): Promise<InterviewSlot[]> {
  const { data, error } = await supabase
    .from("interview_slots")
    .select("id, owner_id, slot_date, slot_time, status, interview_id")
    .eq("owner_id", ownerId)
    .eq("slot_date", date)
    .order("slot_time", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(mapSlot);
}

/**
 * Inserts the given times for a date, skipping any that already exist rather
 * than tripping the (owner_id, slot_date, slot_time) unique constraint.
 * Returns how many were actually created.
 */
export async function createSlots(
  ownerId: string,
  date: string,
  times: string[],
): Promise<number> {
  const existing = new Set((await fetchSlotsForDate(ownerId, date)).map((s) => s.time));
  const fresh = Array.from(new Set(times)).filter((t) => !existing.has(t));
  if (fresh.length === 0) return 0;
  const { error } = await supabase.from("interview_slots").insert(
    fresh.map((t) => ({ owner_id: ownerId, slot_date: date, slot_time: t })),
  );
  if (error) throw error;
  return fresh.length;
}

/** Only ever deletes an OPEN slot. A booked slot means a person confirmed. */
export async function deleteOpenSlot(id: string): Promise<void> {
  const { error } = await supabase
    .from("interview_slots")
    .delete()
    .eq("id", id)
    .eq("status", "open");
  if (error) throw error;
}

/** Closes every OPEN slot on a date. Booked slots are deliberately untouched. */
export async function closeOpenSlotsForDate(ownerId: string, date: string): Promise<void> {
  const { error } = await supabase
    .from("interview_slots")
    .update({ status: "closed" })
    .eq("owner_id", ownerId)
    .eq("slot_date", date)
    .eq("status", "open");
  if (error) throw error;
}

/* -------------------- Interview length (profiles column) -------------------- */

export const INTERVIEW_INTERVALS = [15, 30, 45, 60] as const;
export type InterviewInterval = (typeof INTERVIEW_INTERVALS)[number];
export const DEFAULT_INTERVIEW_INTERVAL: InterviewInterval = 30;

/**
 * NULL = never configured. Any missing, malformed, or out-of-range value falls
 * back to the 30-minute default rather than breaking — this setting only splits
 * a block into slots and must never gate anything.
 */
export function normalizeInterval(v: unknown): InterviewInterval {
  const n = typeof v === "number" ? v : Number(v);
  return (INTERVIEW_INTERVALS as readonly number[]).includes(n)
    ? (n as InterviewInterval)
    : DEFAULT_INTERVIEW_INTERVAL;
}

export async function fetchInterviewInterval(ownerId: string): Promise<InterviewInterval> {
  const { data, error } = await supabase
    .from("profiles")
    .select("interview_interval_minutes" as never)
    .eq("id", ownerId)
    .maybeSingle();
  if (error) throw error;
  const row = data as { interview_interval_minutes: unknown } | null;
  return normalizeInterval(row?.interview_interval_minutes);
}

export async function saveInterviewInterval(
  ownerId: string,
  minutes: InterviewInterval,
): Promise<void> {
  const { error, count } = await supabase
    .from("profiles")
    .update({ interview_interval_minutes: normalizeInterval(minutes) } as never, { count: "exact" })
    .eq("id", ownerId);
  if (error) throw error;
  if (!count) throw new Error(`saveInterviewInterval: no profile row updated for owner ${ownerId}`);
}

/* ------------------------------- Generation ------------------------------- */

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Slot start times from `start` up to (but not including) `end`. */
export function generateTimes(start: string, end: string, intervalMinutes: number): string[] {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e || intervalMinutes <= 0) return [];
  const out: string[] = [];
  for (let t = s; t + intervalMinutes <= e; t += intervalMinutes) out.push(fromMinutes(t));
  return out;
}

/** Today as YYYY-MM-DD on the LOCAL clock (never the UTC date). */
export function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
