// Server functions for the Menu Knowledge Test: a two-stage pipeline that
// first extracts a structured record from the uploaded menu file(s), then
// writes questions from that record only. Plus single-question regeneration
// and publishing of the owner-approved bank.
//
// All runtime logic lives in ./menu-quiz.server so this module stays a thin
// wrapper (server-fn splitting removes handler bodies from client bundles).

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  extractInputSchema,
  generateInputSchema,
  publishInputSchema,
  regenerateInputSchema,
} from "./menu-quiz.schemas";
import type {
  ExtractMenuResult,
  GenerateMenuQuizResult,
  PublishMenuQuizResult,
  RegenerateQuestionResult,
} from "./menu-quiz.schemas";

export type {
  ExtractedItem,
  ExtractMenuResult,
  MenuCoverage,
  MenuQuizQuestion,
  MenuQuizPreviewQuestion,
  MenuQuizDraftQuestion,
  GenerateMenuQuizResult,
  GenerationDiagnostics,
  PublishMenuQuizResult,
  RegenerateQuestionResult,
} from "./menu-quiz.schemas";

export const extractMenuItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => extractInputSchema.parse(data))
  .handler(async ({ data }): Promise<ExtractMenuResult> => {
    const { runExtractMenu } = await import("./menu-quiz.server");
    return runExtractMenu(data);
  });

export const generateMenuQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateInputSchema.parse(data))
  .handler(async ({ data }): Promise<GenerateMenuQuizResult> => {
    const { runGenerateMenuQuiz } = await import("./menu-quiz.server");
    return runGenerateMenuQuiz(data);
  });

export const regenerateMenuQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => regenerateInputSchema.parse(data))
  .handler(async ({ data }): Promise<RegenerateQuestionResult> => {
    const { runRegenerateOne } = await import("./menu-quiz.server");
    return runRegenerateOne(data);
  });

export const publishMenuQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => publishInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<PublishMenuQuizResult> => {
    const { runPublishMenuQuiz } = await import("./menu-quiz.server");
    return runPublishMenuQuiz(context.supabase, context.userId, data.questions);
  });
