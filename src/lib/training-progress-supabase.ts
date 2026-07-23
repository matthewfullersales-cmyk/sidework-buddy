// Owner-scoped Supabase access for per-employee, per-video training progress.
// Backs recordVideoProgress / recordQuizAttempt in sidework-store so the
// manager sees completion status from any device.
import { supabase } from "@/integrations/supabase/client";
import type { VideoProgress } from "@/lib/sidework-store";

type Row = {
  id: string;
  owner_id: string;
  employee_id: string;
  video_id: string;
  watched_sec: number;
  completed_at: string | null;
  quiz_score: number | null;
  passed: boolean;
  attempts: number;
  locked_out: boolean;
  distraction_flagged: boolean;
};

function fromRow(r: Row): VideoProgress {
  return {
    videoId: r.video_id,
    watchedSec: r.watched_sec ?? 0,
    completedAt: r.completed_at ?? undefined,
    quizScore: r.quiz_score ?? undefined,
    passed: r.passed,
    attempts: r.attempts ?? 0,
    lockedOut: r.locked_out,
    distractionFlagged: r.distraction_flagged ?? false,
  };
}

/** Fetch every training row for every employee in this restaurant. */
export async function fetchOwnerTrainingProgress(
  ownerId: string,
): Promise<Map<string, VideoProgress[]>> {
  const { data, error } = await supabase
    .from("training_progress")
    .select("*")
    .eq("owner_id", ownerId);
  if (error) throw error;
  const map = new Map<string, VideoProgress[]>();
  for (const r of (data ?? []) as Row[]) {
    const arr = map.get(r.employee_id) ?? [];
    arr.push(fromRow(r));
    map.set(r.employee_id, arr);
  }
  return map;
}

/** Fetch a single employee's progress rows (used by employee-side hydration). */
export async function fetchEmployeeTrainingProgress(
  employeeId: string,
): Promise<VideoProgress[]> {
  const { data, error } = await supabase
    .from("training_progress")
    .select("*")
    .eq("employee_id", employeeId);
  if (error) throw error;
  return ((data ?? []) as Row[]).map(fromRow);
}

/**
 * Upsert one (employee, video) row. Only fields present in `patch` are updated;
 * missing ones fall back to defaults on insert.
 */
export async function upsertTrainingProgress(
  ownerId: string,
  employeeId: string,
  videoId: string,
  patch: Partial<VideoProgress>,
): Promise<void> {
  // Read-modify-write so partial patches merge instead of clobber. This runs
  // client-side under RLS scoped to owner_id / auth_user_id — cheap and safe.
  const { data: existing, error: readErr } = await supabase
    .from("training_progress")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("video_id", videoId)
    .maybeSingle();
  if (readErr) throw readErr;

  const current = existing as Row | null;
  const merged = {
    owner_id: ownerId,
    employee_id: employeeId,
    video_id: videoId,
    watched_sec: patch.watchedSec ?? current?.watched_sec ?? 0,
    completed_at: patch.completedAt ?? current?.completed_at ?? null,
    quiz_score:
      patch.quizScore !== undefined ? patch.quizScore : current?.quiz_score ?? null,
    passed: patch.passed ?? current?.passed ?? false,
    attempts: patch.attempts ?? current?.attempts ?? 0,
    locked_out: patch.lockedOut ?? current?.locked_out ?? false,
    distraction_flagged: patch.distractionFlagged ?? current?.distraction_flagged ?? false,
  };

  const { error } = await supabase
    .from("training_progress")
    .upsert(merged as never, { onConflict: "employee_id,video_id" });
  if (error) throw error;
}
