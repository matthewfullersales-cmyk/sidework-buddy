// Data-access helpers for shadow shift scheduling (public.shadow_shifts).
// A shadow shift is a prospective hire coming in to shadow an existing
// employee. Managers create and edit them; the trainee confirms (or says they
// can't make it) through the token-scoped public page at /shadow/t/$token,
// mirroring the interview offer flow.
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
  declinedAt: string | null;
  publicToken: string;
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
  declined_at: string | null;
  public_token: string;
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
    declinedAt: row.declined_at ?? null,
    publicToken: row.public_token,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Public (token-scoped) view. Deliberately carries no contact data for anyone. */
export type PublicShadowShift = {
  shiftDate: string;
  arrivalTime: string;
  role: string;
  status: ShadowShiftStatus;
  confirmedAt: string | null;
  declinedAt: string | null;
  firstName: string | null;
  trainerFirstName: string | null;
  restaurantName: string | null;
  address: string | null;
  restaurantPhone: string | null;
  note: string | null;
  shadowPacket: unknown;
};

type PublicShadowShiftRow = {
  shift_date: string;
  arrival_time: string;
  role: string;
  status: string;
  confirmed_at: string | null;
  declined_at: string | null;
  first_name: string | null;
  trainer_first_name: string | null;
  restaurant_name: string | null;
  address: string | null;
  restaurant_phone: string | null;
  note: string | null;
  shadow_packet: unknown;
};

function mapPublic(row: PublicShadowShiftRow): PublicShadowShift {
  return {
    shiftDate: row.shift_date,
    arrivalTime: row.arrival_time,
    role: row.role,
    status: (row.status as ShadowShiftStatus) ?? "scheduled",
    confirmedAt: row.confirmed_at,
    declinedAt: row.declined_at,
    firstName: row.first_name,
    trainerFirstName: row.trainer_first_name,
    restaurantName: row.restaurant_name,
    address: row.address,
    restaurantPhone: row.restaurant_phone,
    note: row.note,
    shadowPacket: row.shadow_packet,
  };
}

export async function getPublicShadowShift(token: string): Promise<PublicShadowShift | null> {
  const { data, error } = await supabase.rpc("get_public_shadow_shift_by_token" as never, { p_token: token } as never);
  if (error) throw error;
  const rows = (data ?? []) as unknown as PublicShadowShiftRow[];
  return rows.length > 0 ? mapPublic(rows[0]!) : null;
}

export async function confirmShadowShiftByToken(token: string): Promise<PublicShadowShift | null> {
  const { data, error } = await supabase.rpc("confirm_shadow_shift_by_token" as never, { p_token: token } as never);
  if (error) throw error;
  const rows = (data ?? []) as unknown as PublicShadowShiftRow[];
  return rows.length > 0 ? mapPublic(rows[0]!) : null;
}

export async function declineShadowShiftByToken(token: string): Promise<PublicShadowShift | null> {
  const { data, error } = await supabase.rpc("decline_shadow_shift_by_token" as never, { p_token: token } as never);
  if (error) throw error;
  const rows = (data ?? []) as unknown as PublicShadowShiftRow[];
  return rows.length > 0 ? mapPublic(rows[0]!) : null;
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
    p_trainer_person_id: input.trainerPersonId ?? undefined,
    p_note: input.note ?? undefined,
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
    p_trainer_person_id: input.trainerPersonId ?? undefined,
    p_note: input.note ?? undefined,
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
