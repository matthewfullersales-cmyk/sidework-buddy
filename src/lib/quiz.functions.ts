// Server-side quiz orchestration. All correct-answer knowledge stays here;
// clients only ever see ONE shuffled question at a time plus an opaque
// attempt id. Grading happens against the stored server-side answer key, and
// per-question timing is measured server-side from `current_served_at`.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  composeQuestions,
  normalizeMenuTestConfig,
  poolsByKind,
  quizSizeFor,
  requiredKindsForRoles,
  shuffle,
  
  MIN_QUESTIONS,
  type BankQuestion,
} from "@/lib/quiz-composition";

// Per-attempt size scales with the bank (see quizSizeFor); these are bounds.
const QUIZ_SIZE = MIN_QUESTIONS;
const PASS_PCT = 80;
/** Network-latency allowance on top of the per-question window. */
const GRACE_MS = 2000;
/** Resumes allowed per question before it is forfeited (see startQuizAttempt). */
const MAX_RESUMES_PER_QUESTION = 2;
/** Floor on the time handed back by a resume, so a real drop stays usable. */
const MIN_RESUME_SECONDS = 6;

const startSchema = z.object({
  employeeId: z.string().uuid(),
  videoId: z.string().min(1).max(80),
});

const answerSchema = z.object({
  attemptId: z.string().uuid(),
  answerIndex: z.number().int().min(-1).max(10),
});

const submitSchema = z.object({
  attemptId: z.string().uuid(),
  distractionFlagged: z.boolean().optional().default(false),
});

export type PublicQuestion = { question: string; options: string[] };

type StoredQuestion = { question: string; options: string[]; correctIndex: number };

export type QuizResponse = {
  index: number;
  answerIndex: number;
  elapsedMs: number;
  timedOut: boolean;
};

/**
 * Allowed seconds for a single question, derived from its own content length.
 * 8s is the recall allowance; chars/18 is a reading allowance at roughly 18
 * characters per second. Clamped to [12, 22] so a short question gets a tight
 * window and a long one gets proportionally more reading time — the test
 * measures recall, not reading speed.
 */
export function secondsForQuestion(question: string, options: string[]): number {
  const chars = question.length + options.join("").length;
  const raw = 8 + Math.ceil(chars / 18);
  return Math.min(22, Math.max(12, raw));
}

export type StartQuizResult =
  | {
      ok: true;
      attemptId: string;
      question: PublicQuestion;
      index: number;
      total: number;
      secondsForQuestion: number;
      passingScore: number;
      isPreview: boolean;
      resumed: boolean;
    }
  | { ok: false; error: string };

export type AnswerQuizResult =
  | {
      ok: true;
      done: false;
      question: PublicQuestion;
      index: number;
      total: number;
      secondsForQuestion: number;
    }
  | { ok: true; done: true; total: number }
  | { ok: false; error: string };

export type SubmitQuizResult =
  | {
      ok: true;
      score: number;
      passed: boolean;
      attempts: number;
      distractionFlagged: boolean;
      bankVersion?: number;
      isPreview: boolean;
      responseTimes: { index: number; elapsedMs: number; timedOut: boolean }[];
    }
  | { ok: false; error: string };

export type QuizAttemptSummary = {
  id: string;
  employeeId: string;
  videoId: string;
  score: number | null;
  passed: boolean | null;
  distractionFlagged: boolean;
  submittedAt: string | null;
  createdAt: string;
};

// Given raw bank questions, produce (a) the client-visible payload with
// options shuffled per-question, and (b) the server-only answer key that
// maps each returned question's correct index in its NEW shuffled order.
function shuffleAndSplit(bank: BankQuestion[]): {
  storedQuestions: StoredQuestion[];
  publicQuestions: PublicQuestion[];
} {
  const stored: StoredQuestion[] = [];
  const pub: PublicQuestion[] = [];
  for (const q of bank) {
    const indexed = q.options.map((opt, idx) => ({ opt, correct: idx === q.answerIndex }));
    const shuffled = shuffle(indexed);
    const options = shuffled.map((s) => s.opt);
    const correctIndex = shuffled.findIndex((s) => s.correct);
    stored.push({ question: q.question, options, correctIndex });
    pub.push({ question: q.question, options });
  }
  return { storedQuestions: stored, publicQuestions: pub };
}

const storedQuestionsSchema = z.array(
  z.object({
    question: z.string(),
    options: z.array(z.string()),
    correctIndex: z.number().int().min(0),
  }),
);

const responsesSchema = z.array(
  z.object({
    index: z.number().int().min(0),
    answerIndex: z.number().int().min(-1),
    elapsedMs: z.number().int().min(0),
    timedOut: z.boolean(),
  }),
);

function parseResponses(value: unknown): QuizResponse[] {
  const parsed = responsesSchema.safeParse(value ?? []);
  return parsed.success ? parsed.data : [];
}

/** Map of question index -> how many times that question has been resumed. */
function parseResumeCounts(value: unknown): Record<string, number> {
  const parsed = z.record(z.string(), z.number()).safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/**
 * Single place that appends (or replaces) a per-question response, so the
 * answer path and the resume-forfeit path can never drift apart.
 */
function appendResponse(
  responses: QuizResponse[],
  entry: QuizResponse,
): QuizResponse[] {
  const next = responses.filter((r) => r.index !== entry.index);
  next.push(entry);
  next.sort((a, b) => a.index - b.index);
  return next;
}

type AttemptRow = {
  id: string;
  employee_id: string;
  video_id: string;
  questions: unknown;
  responses: unknown;
  is_preview: boolean | null;
};

/**
 * Grade and close out an attempt whose responses are complete. Shared by
 * `submitQuizAttempt` and the abandoned-attempt path in `startQuizAttempt`
 * so grading, the single-submission lock, preview skipping, bank_version
 * stamping and the never-regress-a-pass rule stay identical.
 */
async function finalizeAttempt(
  supabaseAdmin: import("@supabase/supabase-js").SupabaseClient,
  attempt: AttemptRow,
  ownerId: string,
  distractionFlagged: boolean,
): Promise<SubmitQuizResult> {
  const stored = storedQuestionsSchema.safeParse(attempt.questions);
  if (!stored.success) return { ok: false, error: "Stored quiz is malformed." };
  const total = stored.data.length;

  const responses = parseResponses(attempt.responses);
  if (responses.length < total) {
    return { ok: false, error: "This attempt isn't finished yet." };
  }

  const byIndex = new Map(responses.map((r) => [r.index, r]));
  let correct = 0;
  stored.data.forEach((q, i) => {
    const r = byIndex.get(i);
    if (r && !r.timedOut && r.answerIndex === q.correctIndex) correct++;
  });
  const score = total === 0 ? 0 : Math.round((correct / total) * 100);
  const passed = score >= PASS_PCT;
  // An owner trying the test out must never write a pass or a response time
  // for an employee — that data drives scheduling decisions.
  const isPreview = !!attempt.is_preview;
  const responseTimes = responses
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((r) => ({ index: r.index, elapsedMs: r.elapsedMs, timedOut: r.timedOut }));

  const { data: submittedAttempt, error: attemptUpdateErr } = await supabaseAdmin
    .from("quiz_attempts")
    .update({
      score,
      passed,
      distraction_flagged: distractionFlagged,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", attempt.id)
    .is("submitted_at", null)
    .select("id")
    .maybeSingle();
  if (attemptUpdateErr) {
    console.error("[quiz] attempt update failed", attemptUpdateErr);
    return { ok: false, error: "Couldn't save the quiz result. Try again." };
  }
  if (!submittedAttempt) return { ok: false, error: "Attempt already submitted." };

  if (isPreview) {
    return {
      ok: true,
      score,
      passed,
      attempts: 0,
      distractionFlagged,
      isPreview: true,
      responseTimes,
    };
  }

  // Upsert training_progress row. We increment attempts and only flip
  // `passed`/`completed_at` forward — never regress a prior pass. For the
  // menu quiz we also stamp the current bank_version so a later menu
  // regeneration correctly invalidates this pass.
  const { data: existing } = await supabaseAdmin
    .from("training_progress")
    .select("*")
    .eq("employee_id", attempt.employee_id)
    .eq("video_id", attempt.video_id)
    .maybeSingle();

  let bankVersion: number | undefined;
  if (attempt.video_id === "menu-quiz") {
    const { data: bankRow } = await supabaseAdmin
      .from("menu_quiz_banks")
      .select("bank_version")
      .eq("owner_id", ownerId)
      .maybeSingle();
    bankVersion = bankRow?.bank_version ?? undefined;
  }

  const attempts = (existing?.attempts ?? 0) + 1;
  // A prior pass only carries forward when it was earned against the same
  // question bank. A menu republish (bank_version bump) invalidates it, so
  // failing the new menu test must NOT be recorded as a pass.
  const alreadyPassed =
    !!existing?.passed &&
    (bankVersion === undefined || existing?.bank_version === bankVersion);
  const nextPassed = alreadyPassed || passed;
  const completedAt = passed
    ? new Date().toISOString()
    : alreadyPassed
      ? (existing?.completed_at ?? null)
      : null;

  const baseRow = {
    owner_id: ownerId,
    employee_id: attempt.employee_id,
    video_id: attempt.video_id,
    watched_sec: existing?.watched_sec ?? 0,
    completed_at: completedAt,
    quiz_score: score,
    passed: nextPassed,
    attempts,
    locked_out: false,
    distraction_flagged: distractionFlagged,
  };
  const upsertRow =
    attempt.video_id === "menu-quiz" && bankVersion !== undefined
      ? { ...baseRow, bank_version: bankVersion }
      : baseRow;

  const { error: upsertErr } = await supabaseAdmin
    .from("training_progress")
    .upsert(upsertRow, { onConflict: "employee_id,video_id" });

  if (upsertErr) {
    console.error("[quiz] training_progress upsert failed", upsertErr);
    return { ok: false, error: "Couldn't save training progress. Try again." };
  }

  return {
    ok: true,
    score,
    passed,
    attempts,
    distractionFlagged,
    bankVersion,
    isPreview: false,
    responseTimes,
  };
}


async function verifyEmployeeAccess(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  employeeId: string,
  userId: string,
): Promise<
  | {
      ok: true;
      ownerId: string;
      primaryRole: string | null;
      approvedRoles: string[];
      /** Owner taking the test on an employee's behalf — never record it. */
      isOwnerPreview: boolean;
    }
  | { ok: false; error: string }
> {
  const { data, error } = await supabase
    .from("restaurant_employees")
    .select("id, owner_id, auth_user_id, primary_role, approved_roles")
    .eq("id", employeeId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Employee not found." };
  const isSelf = data.auth_user_id === userId;
  if (data.owner_id !== userId && !isSelf) {
    return { ok: false, error: "Not authorized for this employee." };
  }
  const approved = Array.isArray(data.approved_roles)
    ? (data.approved_roles as unknown[]).filter((r): r is string => typeof r === "string")
    : [];
  return {
    ok: true,
    ownerId: data.owner_id,
    primaryRole: data.primary_role ?? null,
    approvedRoles: approved,
    isOwnerPreview: !isSelf,
  };
}

export const startQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startSchema.parse(data))
  .handler(async ({ data, context }): Promise<StartQuizResult> => {
    const { supabase, userId } = context;
    const access = await verifyEmployeeAccess(supabase, data.employeeId, userId);
    if (!access.ok) return access;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // RESUME: an unsubmitted, unexpired attempt is picked back up where it
    // left off. A dropped connection must not void progress or hand out a
    // fresh question set.
    const { data: openAttempt } = await supabaseAdmin
      .from("quiz_attempts")
      .select("*")
      .eq("employee_id", data.employeeId)
      .eq("video_id", data.videoId)
      .is("submitted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (openAttempt) {
      const stored = storedQuestionsSchema.safeParse(openAttempt.questions);
      if (stored.success) {
        const total = stored.data.length;
        const idx = openAttempt.current_index ?? 0;
        const responses = parseResponses(openAttempt.responses);

        if (responses.length >= total) {
          // Finished but never submitted: grade it now so walking away from
          // the last question can't be a free, unrecorded do-over. Then fall
          // through and start a fresh attempt.
          await finalizeAttempt(supabaseAdmin, openAttempt, access.ownerId, false);
        } else if (idx < total) {
          const q = stored.data[idx]!;
          const windowSec = secondsForQuestion(q.question, q.options);
          const servedAt = openAttempt.current_served_at
            ? new Date(openAttempt.current_served_at).getTime()
            : Date.now();
          const elapsedMs = Math.max(0, Date.now() - servedAt);
          const counts = parseResumeCounts(openAttempt.resume_counts);
          const used = counts[String(idx)] ?? 0;

          if (used >= MAX_RESUMES_PER_QUESTION) {
            // Reload-to-look-it-up: the question is forfeited, not reserved.
            const nextResponses = appendResponse(responses, {
              index: idx,
              answerIndex: -1,
              elapsedMs,
              timedOut: true,
            });
            const nextIndex = idx + 1;
            const { data: advanced } = await supabaseAdmin
              .from("quiz_attempts")
              .update({
                responses: nextResponses,
                current_index: nextIndex,
                current_served_at: new Date().toISOString(),
              })
              .eq("id", openAttempt.id)
              .is("submitted_at", null)
              .select("*")
              .maybeSingle();

            if (nextIndex >= total) {
              // That was the last question — the attempt is complete. Grade
              // it and let a new attempt begin below.
              await finalizeAttempt(
                supabaseAdmin,
                advanced ?? { ...openAttempt, responses: nextResponses },
                access.ownerId,
                false,
              );
            } else {
              const next = stored.data[nextIndex]!;
              return {
                ok: true,
                attemptId: openAttempt.id,
                question: { question: next.question, options: next.options },
                index: nextIndex,
                total,
                secondsForQuestion: secondsForQuestion(next.question, next.options),
                passingScore: PASS_PCT,
                isPreview: !!openAttempt.is_preview,
                resumed: true,
              };
            }
          } else {
            // Genuine drop: hand back only the time that was left, with a
            // small floor so a resume is still usable.
            const remainingSec = Math.max(
              MIN_RESUME_SECONDS,
              Math.min(windowSec, Math.ceil((windowSec * 1000 - elapsedMs) / 1000)),
            );
            // Back-date the stamp so `window - (now - served_at)` equals the
            // granted seconds — the answer path stays the single authority.
            const servedStamp = new Date(
              Date.now() - (windowSec - remainingSec) * 1000,
            ).toISOString();
            await supabaseAdmin
              .from("quiz_attempts")
              .update({
                current_served_at: servedStamp,
                resume_counts: { ...counts, [String(idx)]: used + 1 },
              })
              .eq("id", openAttempt.id)
              .is("submitted_at", null);
            return {
              ok: true,
              attemptId: openAttempt.id,
              question: { question: q.question, options: q.options },
              index: idx,
              total,
              secondsForQuestion: remainingSec,
              passingScore: PASS_PCT,
              isPreview: !!openAttempt.is_preview,
              resumed: true,
            };
          }
        }
      }
    }


    // Resolve question bank for this video.
    let bank: BankQuestion[] = [];
    if (data.videoId === "menu-quiz") {
      const { data: row, error } = await supabaseAdmin
        .from("menu_quiz_banks")
        .select("questions")
        .eq("owner_id", access.ownerId)
        .maybeSingle();
      if (error) {
        console.error("[quiz] menu bank read failed", error);
        return { ok: false, error: "Couldn't load the menu quiz. Try again." };
      }
      if (!row) {
        return {
          ok: false,
          error: "The menu quiz hasn't been generated for this restaurant yet.",
        };
      }
      const parsed = z
        .array(
          z.object({
            question: z.string(),
            options: z.array(z.string()).length(4),
            answerIndex: z.number().int().min(0).max(3),
            source: z.enum(["food", "drink", "dessert"]).optional(),
          }),
        )
        .safeParse(row.questions);
      if (!parsed.success || parsed.data.length === 0) {
        return { ok: false, error: "The stored menu quiz is malformed." };
      }

      // One blended test. Which pools it draws from comes from the owner's
      // per-role menu test config; the mix is proportional to pool size and
      // interleaved so categories aren't sectioned.
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("menu_test_config")
        .eq("id", access.ownerId)
        .maybeSingle();
      const config = normalizeMenuTestConfig(profile?.menu_test_config ?? null);

      const pools = poolsByKind(parsed.data as BankQuestion[]);
      const roles = access.approvedRoles.length > 0
        ? access.approvedRoles
        : access.primaryRole
          ? [access.primaryRole]
          : [];
      const requiredKinds = requiredKindsForRoles(roles, config, pools);
      if (requiredKinds.length === 0) {
        // Fail closed: either nothing is required (handled client-side), or the
        // role requires a menu type this restaurant has no questions for.
        const configuredKinds = new Set(
          roles.flatMap((r) =>
            Object.prototype.hasOwnProperty.call(config, r) ? config[r] : [],
          ),
        );
        if (configuredKinds.size > 0) {
          return {
            ok: false,
            error:
              "Your role is set to be tested on a menu that hasn't been uploaded yet. Ask your manager to upload it.",
          };
        }
        return { ok: false, error: "No menu test is required for this role." };
      }
      const quizSize = quizSizeFor(pools, requiredKinds);
      bank = composeQuestions(pools, requiredKinds, quizSize);
      if (bank.length < QUIZ_SIZE) {
        return { ok: false, error: "This quiz needs at least 5 questions before it can be assigned." };
      }
    } else {
      // 86Paper is a testing platform: the only knowledge test today is the
      // restaurant-specific Menu Knowledge Test. Future direct tests (e.g. an
      // employee-handbook test) plug in here with their own bank.
      return { ok: false, error: "Unknown knowledge test." };
    }

    if (bank.length < QUIZ_SIZE) {
      return { ok: false, error: "This quiz needs at least 5 questions before it can be assigned." };
    }
    // Order is randomized per attempt; answer choices are shuffled per question
    // inside shuffleAndSplit, so no two attempts look alike.
    const chosen = shuffle(bank);
    const { storedQuestions, publicQuestions } = shuffleAndSplit(chosen);

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("quiz_attempts")
      .insert({
        owner_id: access.ownerId,
        employee_id: data.employeeId,
        video_id: data.videoId,
        questions: storedQuestions,
        question_count: storedQuestions.length,
        current_index: 0,
        current_served_at: new Date().toISOString(),
        responses: [],
        is_preview: access.isOwnerPreview,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      console.error("[quiz] attempt insert failed", insertErr);
      return { ok: false, error: "Couldn't start the quiz. Try again." };
    }

    const first = publicQuestions[0]!;
    return {
      ok: true,
      attemptId: inserted.id,
      question: first,
      index: 0,
      total: publicQuestions.length,
      secondsForQuestion: secondsForQuestion(first.question, first.options),
      passingScore: PASS_PCT,
      isPreview: access.isOwnerPreview,
      resumed: false,
    };
  });

export const answerQuizQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => answerSchema.parse(data))
  .handler(async ({ data, context }): Promise<AnswerQuizResult> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt, error } = await supabaseAdmin
      .from("quiz_attempts")
      .select("*")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (error || !attempt) return { ok: false, error: "Attempt not found." };
    if (attempt.submitted_at) return { ok: false, error: "Attempt already submitted." };
    if (new Date(attempt.expires_at).getTime() <= Date.now()) {
      return { ok: false, error: "This attempt expired. Start a new test." };
    }

    const access = await verifyEmployeeAccess(supabase, attempt.employee_id, userId);
    if (!access.ok) return access;

    const stored = storedQuestionsSchema.safeParse(attempt.questions);
    if (!stored.success) return { ok: false, error: "Stored quiz is malformed." };
    const total = stored.data.length;
    const idx = attempt.current_index ?? 0;
    if (idx >= total) return { ok: true, done: true, total };

    const current = stored.data[idx]!;
    const windowMs = secondsForQuestion(current.question, current.options) * 1000;
    // Timing is measured server-side only; the client never reports elapsed.
    const servedAt = attempt.current_served_at
      ? new Date(attempt.current_served_at).getTime()
      : Date.now();
    const elapsedMs = Math.max(0, Date.now() - servedAt);
    const timedOut = elapsedMs > windowMs + GRACE_MS;

    const responses = parseResponses(attempt.responses).filter((r) => r.index !== idx);
    responses.push({
      index: idx,
      answerIndex: timedOut ? -1 : data.answerIndex,
      elapsedMs,
      timedOut,
    });
    responses.sort((a, b) => a.index - b.index);

    const nextIndex = idx + 1;
    const { error: updErr } = await supabaseAdmin
      .from("quiz_attempts")
      .update({
        responses,
        current_index: nextIndex,
        current_served_at: new Date().toISOString(),
      })
      .eq("id", data.attemptId)
      .is("submitted_at", null);
    if (updErr) {
      console.error("[quiz] answer update failed", updErr);
      return { ok: false, error: "Couldn't record that answer. Try again." };
    }

    if (nextIndex >= total) return { ok: true, done: true, total };
    const next = stored.data[nextIndex]!;
    return {
      ok: true,
      done: false,
      question: { question: next.question, options: next.options },
      index: nextIndex,
      total,
      secondsForQuestion: secondsForQuestion(next.question, next.options),
    };
  });

export const submitQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data, context }): Promise<SubmitQuizResult> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: attempt, error } = await supabaseAdmin
      .from("quiz_attempts")
      .select("*")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (error || !attempt) return { ok: false, error: "Attempt not found." };
    if (attempt.submitted_at) return { ok: false, error: "Attempt already submitted." };
    if (new Date(attempt.expires_at).getTime() <= Date.now()) {
      return { ok: false, error: "This attempt expired. Start a new test." };
    }

    const access = await verifyEmployeeAccess(supabase, attempt.employee_id, userId);
    if (!access.ok) return access;

    return finalizeAttempt(
      supabaseAdmin,
      attempt,
      access.ownerId,
      !!data.distractionFlagged,
    );
  });


export const listOwnerQuizAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuizAttemptSummary[]> => {
    const { data, error } = await context.supabase
      .from("quiz_attempts")
      .select("id, employee_id, video_id, score, passed, distraction_flagged, submitted_at, created_at")
      .eq("owner_id", context.userId)
      // Owner practice runs are not employee results.
      .eq("is_preview", false)
      .not("submitted_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      console.error("[quiz] owner attempt list failed", error);
      return [];
    }
    return (data ?? []).map((row) => ({
      id: row.id,
      employeeId: row.employee_id,
      videoId: row.video_id,
      score: row.score,
      passed: row.passed,
      distractionFlagged: row.distraction_flagged,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
    }));
  });
