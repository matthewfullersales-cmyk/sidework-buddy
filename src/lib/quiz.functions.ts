// Server-side quiz orchestration. All correct-answer knowledge stays here;
// clients only ever see shuffled question text + options + an opaque
// attempt id. Grading happens against the stored server-side answer key.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  QUIZ_POOLS,
  VIDEO_CATEGORY,
  pickRandom,
  shuffle,
  type BankQuestion,
} from "@/lib/quiz-bank.server";

const QUIZ_SIZE = 5;
const SECONDS_PER_QUESTION = 30;
const PASS_PCT = 80;

const startSchema = z.object({
  employeeId: z.string().uuid(),
  videoId: z.string().min(1).max(80),
});

const submitSchema = z.object({
  attemptId: z.string().uuid(),
  answers: z.array(z.number().int().min(-1).max(10)).max(50),
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
    }
  | { ok: false; error: string };

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

    // Resolve question bank for this video.
    let bank: BankQuestion[] = [];
    if (data.videoId === "menu-quiz") {
      const { data: row, error } = await supabase
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
      const category = VIDEO_CATEGORY[data.videoId];
      if (!category) return { ok: false, error: "Unknown training module." };
      bank = QUIZ_POOLS[category];
    }

    const chosen = pickRandom(bank, Math.min(QUIZ_SIZE, bank.length));
    const { storedQuestions, publicQuestions } = shuffleAndSplit(chosen);

    const { data: inserted, error: insertErr } = await supabase
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
    const { data: attempt, error } = await supabase
      .from("quiz_attempts")
      .select("*")
      .eq("id", data.attemptId)
      .maybeSingle();
    if (error || !attempt) return { ok: false, error: "Attempt not found." };
    if (attempt.submitted_at) return { ok: false, error: "Attempt already submitted." };

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

    let correct = 0;
    stored.data.forEach((q, i) => {
      if (data.answers[i] === q.correctIndex) correct++;
    });
    const total = stored.data.length;
    const score = total === 0 ? 0 : Math.round((correct / total) * 100);
    const passed = score >= PASS_PCT;
    const distractionFlagged = !!data.distractionFlagged;

    await supabase
      .from("quiz_attempts")
      .update({
        score,
        passed,
        distraction_flagged: distractionFlagged,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", data.attemptId);

    // Upsert training_progress row. We increment attempts and only flip
    // `passed`/`completed_at` forward — never regress a prior pass.
    const { data: existing } = await supabase
      .from("training_progress")
      .select("*")
      .eq("employee_id", attempt.employee_id)
      .eq("video_id", attempt.video_id)
      .maybeSingle();

    const attempts = (existing?.attempts ?? 0) + 1;
    const alreadyPassed = !!existing?.passed;
    const nextPassed = alreadyPassed || passed;
    const completedAt = alreadyPassed
      ? existing?.completed_at
      : passed
        ? new Date().toISOString()
        : (existing?.completed_at ?? null);

    const { error: upsertErr } = await supabase
      .from("training_progress")
      .upsert(
        {
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
        },
        { onConflict: "employee_id,video_id" },
      );
    if (upsertErr) {
      console.error("[quiz] training_progress upsert failed", upsertErr);
    }

    return { ok: true, score, passed, attempts, distractionFlagged };
  });
