// Owner-scoped Supabase access for the schedule surface:
// shifts, time-off requests, and shift trades. Wave B of the scheduling
// migration — extends the same "effective owner" pattern used by employees
// and the hiring pipeline.
import { supabase } from "@/integrations/supabase/client";
import type { Shift, TimeOffRequest, Trade, TradeStatus, TimeOffStatus, Role, Position } from "@/lib/sidework-store";

/* ---------------- shifts ---------------- */

type ShiftRow = {
  id: string;
  owner_id: string;
  employee_id: string | null;
  local_id: string | null;
  date: string;
  start_time: string;
  end_time: string;
  role: string;
  position: string | null;
  notes: string | null;
  updated_at: string | null;
};

function shiftFromRow(r: ShiftRow): Shift {
  return {
    id: r.id,
    employeeId: r.employee_id ?? "",
    role: r.role as Role,
    date: r.date,
    start: r.start_time,
    end: r.end_time,
    notes: r.notes ?? undefined,
    position: (r.position as Position | null) ?? undefined,
    updatedAt: r.updated_at ?? undefined,
  };
}

function shiftToRow(ownerId: string, s: Shift, employeeIdOverride?: string | null, opts?: { localId?: string | null }) {
  const employeeId = employeeIdOverride !== undefined ? employeeIdOverride : (s.employeeId || null);
  return {
    owner_id: ownerId,
    employee_id: employeeId,
    local_id: opts?.localId ?? null,
    date: s.date,
    start_time: s.start,
    end_time: s.end,
    role: s.role,
    position: s.position ?? null,
    notes: s.notes ?? null,
  };
}

/**
 * Thrown when an update loses an optimistic-concurrency race — the row's
 * updated_at moved between our read and our write. Carries the current
 * server-truth Shift so the caller can replace the stale local copy.
 */
export class ShiftConflictError extends Error {
  readonly current: Shift | null;
  constructor(current: Shift | null) {
    super("Shift was updated by someone else");
    this.name = "ShiftConflictError";
    this.current = current;
  }
}

export async function fetchOwnerShifts(ownerId: string): Promise<Shift[]> {
  const { data, error } = await supabase
    .from("shifts").select("*").eq("owner_id", ownerId).order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => shiftFromRow(r as ShiftRow));
}

async function fetchShiftById(id: string): Promise<Shift | null> {
  const { data } = await supabase.from("shifts").select("*").eq("id", id).maybeSingle();
  return data ? shiftFromRow(data as ShiftRow) : null;
}

export async function upsertShiftRow(ownerId: string, s: Shift, employeeIdOverride?: string | null): Promise<Shift> {
  // If s.id is a uuid, update. Otherwise insert (local id becomes cloud id).
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.id);
  if (isUuid) {
    let q = supabase
      .from("shifts")
      .update(shiftToRow(ownerId, s, employeeIdOverride))
      .eq("id", s.id);
    // Optimistic concurrency: only match if the row hasn't moved since we read it.
    if (s.updatedAt) q = q.eq("updated_at", s.updatedAt);
    const { data, error } = await q.select("*").maybeSingle();
    if (error) throw error;
    if (!data) {
      // Either the row is gone or another writer bumped updated_at. Refetch truth.
      const current = await fetchShiftById(s.id);
      throw new ShiftConflictError(current);
    }
    return shiftFromRow(data as ShiftRow);
  }
  const { data, error } = await supabase
    .from("shifts")
    .insert(shiftToRow(ownerId, s, employeeIdOverride))
    .select("*")
    .single();
  if (error) throw error;
  return shiftFromRow(data as ShiftRow);
}


export async function deleteShiftRow(id: string): Promise<void> {
  const { error } = await supabase.from("shifts").delete().eq("id", id);
  if (error) throw error;
}

export async function reassignShiftEmployee(id: string, employeeId: string | null): Promise<void> {
  const { error } = await supabase.from("shifts").update({ employee_id: employeeId }).eq("id", id);
  if (error) throw error;
}

/* ---------------- time-off ---------------- */

type TimeOffRow = {
  id: string;
  owner_id: string;
  employee_id: string | null;
  local_id: string | null;
  start_date: string;
  end_date: string;
  status: string;
  resolved_at: string | null;
  created_at: string;
};

function timeOffFromRow(r: TimeOffRow): TimeOffRequest {
  return {
    id: r.id,
    employeeId: r.employee_id ?? "",
    startDate: r.start_date,
    endDate: r.end_date,
    status: (r.status as TimeOffStatus) ?? "pending",
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? undefined,
  };
}

export async function fetchOwnerTimeOff(ownerId: string): Promise<TimeOffRequest[]> {
  const { data, error } = await supabase
    .from("time_off_requests").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => timeOffFromRow(r as TimeOffRow));
}

export async function insertTimeOffRow(
  ownerId: string,
  t: Omit<TimeOffRequest, "id" | "createdAt" | "status">,
  employeeIdOverride?: string | null,
): Promise<TimeOffRequest> {
  const { data, error } = await supabase
    .from("time_off_requests")
    .insert({
      owner_id: ownerId,
      employee_id: employeeIdOverride !== undefined ? employeeIdOverride : (t.employeeId || null),
      start_date: t.startDate,
      end_date: t.endDate,
    })
    .select("*")
    .single();
  if (error) throw error;
  return timeOffFromRow(data as TimeOffRow);
}

export async function updateTimeOffRow(
  id: string,
  patch: { status?: TimeOffStatus; resolvedAt?: string | null },
): Promise<void> {
  const row: {
    status?: TimeOffStatus;
    resolved_at?: string | null;
  } = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.resolvedAt !== undefined) row.resolved_at = patch.resolvedAt;
  const { error } = await supabase.from("time_off_requests").update(row).eq("id", id);
  if (error) throw error;
}

/* ---------------- trades ---------------- */

type TradeRow = {
  id: string;
  owner_id: string;
  shift_id: string | null;
  local_id: string | null;
  posted_by: string | null;
  claimed_by: string | null;
  status: string;
  note: string | null;
  auto_approved: boolean;
  approved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

function tradeFromRow(r: TradeRow): Trade {
  return {
    id: r.id,
    shiftId: r.shift_id ?? "",
    postedBy: r.posted_by ?? "",
    claimedBy: r.claimed_by ?? undefined,
    status: (r.status as TradeStatus) ?? "open",
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? undefined,
    approvedBy: r.approved_by ?? undefined,
    autoApproved: r.auto_approved,
    note: r.note ?? undefined,
  };
}

export async function fetchOwnerTrades(ownerId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from("shift_trades").select("*").eq("owner_id", ownerId).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => tradeFromRow(r as TradeRow));
}

export async function insertTradeRow(
  ownerId: string,
  shiftId: string,
  postedBy: string,
  note?: string,
): Promise<Trade> {
  const { data, error } = await supabase
    .from("shift_trades")
    .insert({
      owner_id: ownerId,
      shift_id: shiftId,
      posted_by: postedBy || null,
      status: "open",
      note: note ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return tradeFromRow(data as TradeRow);
}

export async function updateTradeRow(
  id: string,
  patch: Partial<Pick<Trade, "status" | "claimedBy" | "autoApproved" | "approvedBy" | "resolvedAt">>,
): Promise<void> {
  const row: {
    status?: string;
    claimed_by?: string | null;
    auto_approved?: boolean;
    approved_by?: string | null;
    resolved_at?: string | null;
  } = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.claimedBy !== undefined) row.claimed_by = patch.claimedBy || null;
  if (patch.autoApproved !== undefined) row.auto_approved = patch.autoApproved;
  if (patch.approvedBy !== undefined) row.approved_by = patch.approvedBy ?? null;
  if (patch.resolvedAt !== undefined) row.resolved_at = patch.resolvedAt ?? null;
  const { error } = await supabase.from("shift_trades").update(row).eq("id", id);
  if (error) throw error;
}

/* ---------------- bootstrap ---------------- */

/**
 * One-shot upload of any local shifts/time-off/trades that this owner still
 * has in localStorage after Wave A already moved employees. Idempotent via
 * per-table UNIQUE(owner_id, local_id).
 *
 * Requires the employee id map so shift.employeeId references get translated
 * from old local ids (e.g. "e5") to the new cloud UUIDs.
 */
export async function bootstrapLocalSchedule(
  ownerId: string,
  args: {
    shifts: Shift[];
    timeOff: TimeOffRequest[];
    trades: Trade[];
    localToCloudEmployeeId: Map<string, string>;
  },
): Promise<{ shifts: Shift[]; timeOff: TimeOffRequest[]; trades: Trade[] }> {
  const { shifts, timeOff, trades, localToCloudEmployeeId } = args;
  const mapEmp = (id: string | undefined | null): string | null => {
    if (!id) return null;
    return localToCloudEmployeeId.get(id) ?? null;
  };

  // 1. shifts
  const localShiftIdToCloud = new Map<string, string>();
  if (shifts.length > 0) {
    const rows = shifts.map((s) => ({
      owner_id: ownerId,
      employee_id: mapEmp(s.employeeId),
      local_id: s.id,
      date: s.date,
      start_time: s.start,
      end_time: s.end,
      role: s.role,
      position: s.position ?? null,
      notes: s.notes ?? null,
    }));
    const { error } = await supabase
      .from("shifts")
      .upsert(rows, { onConflict: "owner_id,local_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  const cloudShifts = await fetchOwnerShifts(ownerId);
  // Build local→cloud shift id map from local_id (need extra fetch to get it)
  const { data: shiftMapRows } = await supabase
    .from("shifts")
    .select("id, local_id")
    .eq("owner_id", ownerId)
    .not("local_id", "is", null);
  for (const r of (shiftMapRows ?? []) as Array<{ id: string; local_id: string | null }>) {
    if (r.local_id) localShiftIdToCloud.set(r.local_id, r.id);
  }

  // 2. time-off
  if (timeOff.length > 0) {
    const rows = timeOff.map((t) => ({
      owner_id: ownerId,
      employee_id: mapEmp(t.employeeId),
      local_id: t.id,
      start_date: t.startDate,
      end_date: t.endDate,
      status: t.status,
      resolved_at: t.resolvedAt ?? null,
    }));
    const { error } = await supabase
      .from("time_off_requests")
      .upsert(rows, { onConflict: "owner_id,local_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  const cloudTimeOff = await fetchOwnerTimeOff(ownerId);

  // 3. trades — reference translated shift/employee ids
  if (trades.length > 0) {
    const rows = trades.map((t) => ({
      owner_id: ownerId,
      shift_id: localShiftIdToCloud.get(t.shiftId) ?? null,
      local_id: t.id,
      posted_by: mapEmp(t.postedBy),
      claimed_by: mapEmp(t.claimedBy),
      status: t.status,
      note: t.note ?? null,
      auto_approved: t.autoApproved ?? false,
      approved_by: t.approvedBy ?? null,
      resolved_at: t.resolvedAt ?? null,
    }));
    const { error } = await supabase
      .from("shift_trades")
      .upsert(rows, { onConflict: "owner_id,local_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  const cloudTrades = await fetchOwnerTrades(ownerId);

  return { shifts: cloudShifts, timeOff: cloudTimeOff, trades: cloudTrades };
}
