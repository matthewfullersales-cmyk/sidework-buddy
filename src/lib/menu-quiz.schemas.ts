// Client-safe schemas & types for the Menu Knowledge Test generation flow.
// Kept out of the .server module because inputValidator runs on both sides.

import { z } from "zod";

export const filePayload = z.object({
  fileBase64: z.string().min(50),
  mimeType: z.string(),
});
export type FilePayload = z.infer<typeof filePayload>;

export const menuSourceSchema = z.enum(["food", "drink", "dessert"]);
export type MenuSource = z.infer<typeof menuSourceSchema>;

export const generateInputSchema = z
  .object({
    food: filePayload.optional(),
    drink: filePayload.optional(),
    dessert: filePayload.optional(),
    restaurantName: z.string().trim().max(200).optional().default(""),
  })
  .refine((v) => v.food || v.drink || v.dessert, {
    message: "Upload at least one menu (food, drink, or dessert).",
  });

export const questionSchema = z.object({
  question: z.string().min(4),
  options: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  source: menuSourceSchema,
  sourceItem: z.string().trim().max(160).optional().default(""),
  sourceCategory: z.string().trim().max(120).optional().default(""),
});

export type MenuQuizQuestion = z.infer<typeof questionSchema>;
export type MenuQuizPreviewQuestion = Pick<MenuQuizQuestion, "question" | "options" | "source">;
/** Draft returned by generateMenuQuiz — includes answerIndex for owner review. NOT persisted. */
export type MenuQuizDraftQuestion = MenuQuizQuestion;

export const publishInputSchema = z.object({
  questions: z.array(questionSchema).min(1).max(80),
});

export const regenerateInputSchema = z.object({
  file: filePayload,
  source: menuSourceSchema,
  sourceItem: z.string().trim().max(160).default(""),
  sourceCategory: z.string().trim().max(120).optional().default(""),
  avoid: z.array(z.string().max(240)).max(80).optional().default([]),
  restaurantName: z.string().trim().max(200).optional().default(""),
});

export type GenerateMenuQuizResult =
  | {
      ok: true;
      questions: MenuQuizDraftQuestion[];
      foodCount: number;
      drinkCount: number;
      dessertCount: number;
      rejectedCount: number;
    }
  | { ok: false; error: string };

export type PublishMenuQuizResult =
  | { ok: true; bankVersion: number; foodCount: number; drinkCount: number; dessertCount: number }
  | { ok: false; error: string };

export type RegenerateQuestionResult =
  | { ok: true; question: MenuQuizDraftQuestion }
  | { ok: false; error: string };
