// Employee-scoped Supabase access. Used when the signed-in user is an
// individual employee (not the owner and not a hiring/scheduling manager).
// RLS restricts every query to the caller's own restaurant_employees row +
// data derived from it (own shifts, open trades in the same restaurant, own
// time-off history).
import { supabase } from "@/integrations/supabase/client";
import type { Employee, Shift, Trade, TimeOffRequest } from "@/lib/sidework-store";
import { employeeFromRow } from "@/lib/employees-supabase";

export type EmployeeContext = {
  ownerId: string;
  employeeId: string;
  restaurantName: string | null;
};

export async function fetchEmployeeContext(): Promise<EmployeeContext | null> {
  const { data, error } = await supabase.rpc("get_employee_context");
  if (error || !data || (Array.isArray(data) && data.length === 0)) return null;
  const row = (Array.isArray(data) ? data[0] : data) as {
    owner_id: string;
    employee_id: string;
    restaurant_name: string | null;
  };
  if (!row?.employee_id || !row?.owner_id) return null;
  return {
    ownerId: row.owner_id,
    employeeId: row.employee_id,
    restaurantName: row.restaurant_name,
  };
}

export async function fetchMyEmployeeRow(employeeId: string): Promise<Employee | null> {
  const { data, error } = await supabase
    .from("restaurant_employees")
    .select("*")
    .eq("id", employeeId)
    .maybeSingle();
  if (error || !data) return null;
  return employeeFromRow(data as never);
}

export async function fetchMyShifts(employeeId: string): Promise<Shift[]> {
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", employeeId)
    .order("date", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: (r as { id: string }).id,
    employeeId: (r as { employee_id: string | null }).employee_id ?? "",
    role: (r as { role: string }).role,
    date: (r as { date: string }).date,
    start: (r as { start_time: string }).start_time,
    end: (r as { end_time: string }).end_time,
    notes: (r as { notes: string | null }).notes ?? undefined,
    position: ((r as { position: string | null }).position ?? undefined) as Shift["position"],
  }));
}

/** Trades open (or awaiting approval) in the caller's restaurant. RLS
 * restricts to the same owner_id as the caller's employee row. */
export async function fetchOwnerOpenTrades(ownerId: string): Promise<Trade[]> {
  const { data, error } = await supabase
    .from("shift_trades")
    .select("*")
    .eq("owner_id", ownerId)
    .in("status", ["open", "pending_approval", "approved", "denied"])
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as {
      id: string; shift_id: string | null; posted_by: string | null; claimed_by: string | null;
      status: string; note: string | null; auto_approved: boolean; approved_by: string | null;
      resolved_at: string | null; created_at: string;
    };
    return {
      id: row.id,
      shiftId: row.shift_id ?? "",
      postedBy: row.posted_by ?? "",
      claimedBy: row.claimed_by ?? undefined,
      status: row.status as Trade["status"],
      createdAt: row.created_at,
      resolvedAt: row.resolved_at ?? undefined,
      approvedBy: row.approved_by ?? undefined,
      autoApproved: row.auto_approved,
      note: row.note ?? undefined,
    };
  });
}

/** Shifts referenced by open trades — visible to any employee in the same
 * restaurant via the "Employees view trade-board shifts" policy. Fetches by
 * id so an employee can render the trade card even for shifts that aren't
 * their own. */
export async function fetchShiftsByIds(ids: string[]): Promise<Shift[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from("shifts").select("*").in("id", ids);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as {
      id: string; employee_id: string | null; role: string; date: string;
      start_time: string; end_time: string; notes: string | null; position: string | null;
    };
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      role: row.role,
      date: row.date,
      start: row.start_time,
      end: row.end_time,
      notes: row.notes ?? undefined,
      position: (row.position ?? undefined) as Shift["position"],
    };
  });
}

export async function fetchMyTimeOff(employeeId: string): Promise<TimeOffRequest[]> {
  const { data, error } = await supabase
    .from("time_off_requests")
    .select("*")
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const row = r as {
      id: string; employee_id: string | null; start_date: string; end_date: string;
      reason_type: string | null; reason: string; status: string;
      resolved_at: string | null; decision_note: string | null; created_at: string;
    };
    return {
      id: row.id,
      employeeId: row.employee_id ?? "",
      startDate: row.start_date,
      endDate: row.end_date,
      reasonType: row.reason_type ?? undefined,
      reason: row.reason,
      status: row.status as TimeOffRequest["status"],
      createdAt: row.created_at,
      resolvedAt: row.resolved_at ?? undefined,
      decisionNote: row.decision_note ?? undefined,
    };
  });
}

/** Fetch the "other party" employee rows referenced by a set of trades so
 * the UI can show names. Uses the trade-board SELECT visibility that RLS
 * grants employees in the same restaurant — actually restaurant_employees
 * SELECT is more restrictive (own row only + manager visibility), so we
 * fall back to name-less display for non-self trades. */
export async function fetchVisibleEmployeeRows(ids: string[]): Promise<Employee[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("restaurant_employees")
    .select("*")
    .in("id", ids);
  if (error) return [];
  return (data ?? []).map((r) => employeeFromRow(r as never));
}
