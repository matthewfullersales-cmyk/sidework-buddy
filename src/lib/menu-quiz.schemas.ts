// Client-safe schemas & types for the Menu Knowledge Test generation flow.
// Kept out of the .server module because inputValidator runs on both sides.
//
// The pipeline is two-stage:
//   1. extractMenuItems  -> structured record of every item on the upload(s)
//   2. generateMenuQuiz  -> questions written from that record only

import { z } from "zod";

export const filePayload = z.object({
  fileBase64: z.string().min(50),
  mimeType: z.string(),
  filename: z.string().max(200).optional().default("menu"),
});
export type FilePayload = z.infer<typeof filePayload>;

export const menuSourceSchema = z.enum(["food", "drink", "dessert"]);
export type MenuSource = z.infer<typeof menuSourceSchema>;

/* ---------------------------- stage 1: extraction --------------------------- */

export const extractedItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  section: z.string().trim().max(120).default(""),
  ingredients: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  preparation: z.string().trim().max(400).default(""),
  menuType: menuSourceSchema,
});
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

export const extractInputSchema = z.object({
  files: z.array(filePayload).min(1).max(6),
  restaurantName: z.string().trim().max(200).optional().default(""),
});

export type MenuCoverage = {
  foodItems: number;
  drinkItems: number;
  dessertItems: number;
  sections: string[];
};

export type ExtractMenuResult =
  | { ok: true; items: ExtractedItem[]; coverage: MenuCoverage }
  | { ok: false; error: string };

/* ---------------------------- stage 2: generation --------------------------- */

export const questionTypeSchema = z.enum(["identify_item", "identify_attribute"]);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const questionSchema = z.object({
  question: z.string().min(4),
  options: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  source: menuSourceSchema,
  sourceItem: z.string().trim().max(160).optional().default(""),
  sourceCategory: z.string().trim().max(120).optional().default(""),
  questionType: questionTypeSchema.optional().default("identify_item"),
});

export type MenuQuizQuestion = z.infer<typeof questionSchema>;
export type MenuQuizPreviewQuestion = Pick<MenuQuizQuestion, "question" | "options" | "source">;
/** Draft returned by generateMenuQuiz — includes answerIndex for owner review. NOT persisted. */
export type MenuQuizDraftQuestion = MenuQuizQuestion;

export const generateInputSchema = z.object({
  items: z.array(extractedItemSchema).min(1).max(400),
  restaurantName: z.string().trim().max(200).optional().default(""),
});

export const publishInputSchema = z.object({
  questions: z.array(questionSchema).min(1).max(150),
});

export const regenerateInputSchema = z.object({
  item: extractedItemSchema,
  avoid: z.array(z.string().max(240)).max(120).optional().default([]),
  restaurantName: z.string().trim().max(200).optional().default(""),
});

/** Honest accounting of the generation run, surfaced to the owner. */
export type GenerationDiagnostics = {
  itemsExtracted: number;
  candidatesSelected: number;
  questionsReturned: number;
  rejectedByQuality: number;
  lostToFailedBatches: number;
  finalBankSize: number;
};

export type GenerateMenuQuizResult =
  | {
      ok: true;
      questions: MenuQuizDraftQuestion[];
      foodCount: number;
      drinkCount: number;
      dessertCount: number;
      rejectedCount: number;
      diagnostics: GenerationDiagnostics;
    }
  | { ok: false; error: string };

export type PublishMenuQuizResult =
  | { ok: true; bankVersion: number; foodCount: number; drinkCount: number; dessertCount: number }
  | { ok: false; error: string };

export type RegenerateQuestionResult =
  | { ok: true; question: MenuQuizDraftQuestion }
  | { ok: false; error: string };
