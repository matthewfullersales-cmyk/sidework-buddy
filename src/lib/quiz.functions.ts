// Server-side quiz orchestration. All correct-answer knowledge stays here;
// clients only ever see shuffled question text + options + an opaque
// attempt id. Grading happens against the stored server-side answer key.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const QUIZ_SIZE = 5;
const SECONDS_PER_QUESTION = 30;
const PASS_PCT = 80;
type BankQuestion = { question: string; options: string[]; answerIndex: number };

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom<T>(items: T[], count: number): T[] {
  return shuffle(items).slice(0, count);
}

const startSchema = z.object({
  employeeId: z.string().uuid(),
  videoId: z.string().min(1).max(80),
});

const submitSchema = z.object({
  attemptId: z.string().uuid(),
  answers: z.array(z.number().int().min(-1).max(10)).max(QUIZ_SIZE),
  distractionFlagged: z.boolean().optional().default(false),
});

export type PublicQuestion = { question: string; options: string[] };

export type StartQuizResult =
  | {
      ok: true;
      attemptId: string;
      questions: PublicQuestion[];
      secondsPerQuestion: number;
      passingScore: number;
    }
  | { ok: false; error: string };

export type SubmitQuizResult =
  | {
      ok: true;
      score: number;
      passed: boolean;
      attempts: number;
      distractionFlagged: boolean;
      bankVersion?: number;
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
  storedQuestions: {
    question: string;
    options: string[];
    correctIndex: number;
  }[];
  publicQuestions: PublicQuestion[];
} {
  const stored: { question: string; options: string[]; correctIndex: number }[] = [];
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

async function verifyEmployeeAccess(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  employeeId: string,
  userId: string,
): Promise<{ ok: true; ownerId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("restaurant_employees")
    .select("id, owner_id, auth_user_id")
    .eq("id", employeeId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Employee not found." };
  if (data.owner_id !== userId && data.auth_user_id !== userId) {
    return { ok: false, error: "Not authorized for this employee." };
  }
  return { ok: true, ownerId: data.owner_id };
}

export const startQuizAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => startSchema.parse(data))
  .handler(async ({ data, context }): Promise<StartQuizResult> => {
    const { supabase, userId } = context;
    const access = await verifyEmployeeAccess(supabase, data.employeeId, userId);
    if (!access.ok) return access;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
          }),
        )
        .safeParse(row.questions);
      if (!parsed.success || parsed.data.length === 0) {
        return { ok: false, error: "The stored menu quiz is malformed." };
      }
      bank = parsed.data;
    } else {
      const { QUIZ_POOLS, VIDEO_CATEGORY } = await import("@/lib/quiz-bank.server");
      const category = VIDEO_CATEGORY[data.videoId];
      if (!category) return { ok: false, error: "Unknown training module." };
      bank = QUIZ_POOLS[category];
    }

    if (bank.length < QUIZ_SIZE) {
      return { ok: false, error: "This quiz needs at least 5 questions before it can be assigned." };
    }
    const chosen = pickRandom(bank, QUIZ_SIZE);
    const { storedQuestions, publicQuestions } = shuffleAndSplit(chosen);

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("quiz_attempts")
      .insert({
        owner_id: access.ownerId,
        employee_id: data.employeeId,
        video_id: data.videoId,
        questions: storedQuestions,
        question_count: storedQuestions.length,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) {
      console.error("[quiz] attempt insert failed", insertErr);
      return { ok: false, error: "Couldn't start the quiz. Try again." };
    }

    return {
      ok: true,
      attemptId: inserted.id,
      questions: publicQuestions,
      secondsPerQuestion: SECONDS_PER_QUESTION,
      passingScore: PASS_PCT,
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
      return { ok: false, error: "This attempt expired. Start a new quiz." };
    }

    const access = await verifyEmployeeAccess(supabase, attempt.employee_id, userId);
    if (!access.ok) return access;

    const stored = z
      .array(
        z.object({
          question: z.string(),
          options: z.array(z.string()),
          correctIndex: z.number().int().min(0),
        }),
      )
      .safeParse(attempt.questions);
    if (!stored.success) return { ok: false, error: "Stored quiz is malformed." };
    if (data.answers.length !== stored.data.length) {
      return { ok: false, error: "The submitted answers don't match this attempt." };
    }

    let correct = 0;
    stored.data.forEach((q, i) => {
      if (data.answers[i] === q.correctIndex) correct++;
    });
    const total = stored.data.length;
    const score = total === 0 ? 0 : Math.round((correct / total) * 100);
    const passed = score >= PASS_PCT;
    const distractionFlagged = !!data.distractionFlagged;

    const { data: submittedAttempt, error: attemptUpdateErr } = await supabaseAdmin
      .from("quiz_attempts")
      .update({
        score,
        passed,
        distraction_flagged: distractionFlagged,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", data.attemptId)
      .is("submitted_at", null)
      .select("id")
      .maybeSingle();
    if (attemptUpdateErr) {
      console.error("[quiz] attempt update failed", attemptUpdateErr);
      return { ok: false, error: "Couldn't save the quiz result. Try again." };
    }
    if (!submittedAttempt) return { ok: false, error: "Attempt already submitted." };

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
        .eq("owner_id", access.ownerId)
        .maybeSingle();
      bankVersion = bankRow?.bank_version ?? undefined;
    }

    const attempts = (existing?.attempts ?? 0) + 1;
    const alreadyPassed = !!existing?.passed;
    const nextPassed = alreadyPassed || passed;
    const completedAt = alreadyPassed
      ? existing?.completed_at
      : passed
        ? new Date().toISOString()
        : (existing?.completed_at ?? null);

    const baseRow = {
      owner_id: access.ownerId,
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

    return { ok: true, score, passed, attempts, distractionFlagged, bankVersion };
  });


export const listOwnerQuizAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuizAttemptSummary[]> => {
    const { data, error } = await context.supabase
      .from("quiz_attempts")
      .select("id, employee_id, video_id, score, passed, distraction_flagged, submitted_at, created_at")
      .eq("owner_id", context.userId)
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
