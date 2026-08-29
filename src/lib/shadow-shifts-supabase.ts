// Data-access helpers for shadow shift scheduling (public.shadow_shifts).
// A shadow shift is a prospective hire coming in to shadow an existing
// employee. Managers create and edit them; the trainee-facing surface does
// not exist yet, so everything here is manager-scoped.
import { supabase } from "@/integrations/supabase/client";

export type ShadowShiftStatus = "scheduled" | "cancelled" | "completed";

export type ShadowShift = {
  id: string;
  ownerId: string;
  personId: string;
  role: string;
  shiftDate: string;
  arrivalTime: string;
  trainerPersonId: string | null;
  note: string | null;
  status: ShadowShiftStatus;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ShadowShiftRow = {
  id: string;
  owner_id: string;
  person_id: string;
  role: string;
  shift_date: string;
  arrival_time: string;
  trainer_person_id: string | null;
  note: string | null;
  status: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

function mapShadowShift(row: ShadowShiftRow): ShadowShift {
  return {
    id: row.id,
    ownerId: row.owner_id,
    personId: row.person_id,
    role: row.role,
    shiftDate: row.shift_date,
    arrivalTime: row.arrival_time,
    trainerPersonId: row.trainer_person_id,
    note: row.note,
    status: (row.status as ShadowShiftStatus) ?? "scheduled",
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchShadowShiftsForPeople(personIds: string[]): Promise<ShadowShift[]> {
  if (personIds.length === 0) return [];
  const { data, error } = await supabase
    .from("shadow_shifts")
    .select("*")
    .in("person_id", personIds)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as ShadowShiftRow[]).map(mapShadowShift);
}

/** Manager-only. Also moves the person into `shadow` state in the same transaction. */
export async function createShadowShift(input: {
  personId: string;
  role: string;
  shiftDate: string;
  arrivalTime: string;
  trainerPersonId?: string | null;
  note?: string | null;
}): Promise<ShadowShift> {
  const { data, error } = await supabase.rpc("create_shadow_shift", {
    p_person_id: input.personId,
    p_role: input.role,
    p_shift_date: input.shiftDate,
    p_arrival_time: input.arrivalTime,
    p_trainer_person_id: input.trainerPersonId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return mapShadowShift(data as unknown as ShadowShiftRow);
}

/**
 * Manager-only. The server compares stored values and clears `confirmed_at`
 * only when the date or arrival time actually moved.
 */
export async function updateShadowShift(input: {
  id: string;
  shiftDate: string;
  arrivalTime: string;
  trainerPersonId?: string | null;
  note?: string | null;
}): Promise<ShadowShift> {
  const { data, error } = await supabase.rpc("update_shadow_shift", {
    p_id: input.id,
    p_shift_date: input.shiftDate,
    p_arrival_time: input.arrivalTime,
    p_trainer_person_id: input.trainerPersonId ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  return mapShadowShift(data as unknown as ShadowShiftRow);
}

export async function cancelShadowShift(id: string): Promise<void> {
  const { error } = await supabase
    .from("shadow_shifts")
    .update({ status: "cancelled" })
    .eq("id", id);
  if (error) throw error;
}
