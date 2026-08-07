// Server function: generate real menu-quiz questions from an uploaded menu
// (PDF or image) using the Lovable AI Gateway. The owner can upload the food
// menu, the drink menu, or both — questions are drawn across whatever
// menus are provided so the single unified "Menu Knowledge Test" covers
// this restaurant's actual offerings.
//
// Regenerating bumps `menu_quiz_banks.bank_version`, which invalidates every
// existing staff pass (they must retake against the current menu before
// they can be scheduled again).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);

const filePayload = z.object({
  fileBase64: z.string().min(50),
  mimeType: z.string(),
});
const inputSchema = z
  .object({
    food: filePayload.optional(),
    drink: filePayload.optional(),
    dessert: filePayload.optional(),
    restaurantName: z.string().trim().max(200).optional().default(""),
  })
  .refine((v) => v.food || v.drink || v.dessert, {
    message: "Upload at least one menu (food, drink, or dessert).",
  });

const questionSchema = z.object({
  question: z.string().min(4),
  options: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  source: z.enum(["food", "drink", "dessert"]),
});
const modelResponseSchema = z.object({
  questions: z.array(questionSchema).min(1).max(60),
});

export type MenuQuizQuestion = z.infer<typeof questionSchema>;
export type MenuQuizPreviewQuestion = Pick<MenuQuizQuestion, "question" | "options" | "source">;
/** Draft returned by generateMenuQuiz — includes answerIndex for owner review. NOT persisted. */
export type MenuQuizDraftQuestion = MenuQuizQuestion;
export type GenerateMenuQuizResult =
  | { ok: true; questions: MenuQuizDraftQuestion[]; foodCount: number; drinkCount: number; dessertCount: number }
  | { ok: false; error: string };
export type PublishMenuQuizResult =
  | { ok: true; bankVersion: number; foodCount: number; drinkCount: number; dessertCount: number }
  | { ok: false; error: string };



function buildSystemPrompt(kinds: Array<"food" | "drink" | "dessert">): string {
  const names: Record<string, string> = { food: "food menu", drink: "drink menu", dessert: "dessert menu" };
  const list = kinds.map((k) => names[k]).join(", ");
  const perMenu = kinds.length > 1 ? 15 : 15;
  const coverage = `You will be given ${kinds.length} menu file(s): ${list}. Write about ${perMenu} questions PER menu file (roughly ${perMenu * kinds.length} total). Every question must reference an item that appears in the menu it was drawn from. Tag each question with a "source" field of exactly ${kinds.map((k) => `"${k}"`).join(", ")} depending on which uploaded menu it came from. Never emit a source that was not uploaded.`;
  return `You are a restaurant training coach building the mandatory "Menu Knowledge Test" for a restaurant's floor and kitchen staff. This is a gating test — an employee cannot be scheduled until they pass it — so every question must test genuine, on-menu knowledge.

${coverage}

Rules:
- Only use items and details that ACTUALLY appear on the menus you were given. Never invent items.
- If a file is blurry, unreadable, or clearly not a menu, skip that file. If no file yields anything usable, return {"questions": []}.
- Each question must have exactly 4 options and exactly one correct answer.
- Mix question types: "What's in [dish/drink/dessert]?", "Which item contains [ingredient]?", "Which category does [item] belong to?", "What garnish/side comes with [item]?".
- Distractors must be plausible — prefer other items from the SAME menu.
- Keep questions concise (under 140 chars) and answers under 90 chars.
- Return STRICT JSON only, matching this shape exactly, no prose, no markdown fences:
{"questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"source":"food"}, ...]}`;
}

type UserBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

function fileBlocks(label: string, filename: string, payload: { fileBase64: string; mimeType: string }): UserBlock[] {
  const dataUrl = `data:${payload.mimeType};base64,${payload.fileBase64}`;
  const intro: UserBlock = { type: "text", text: label };
  if (payload.mimeType === "application/pdf") {
    return [intro, { type: "file", file: { filename, file_data: dataUrl } }];
  }
  return [intro, { type: "image_url", image_url: { url: dataUrl } }];
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fenced) {
      try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
    }
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* fall through */ }
    }
    throw new Error("Model did not return valid JSON.");
  }
}

function validatePayload(p: { fileBase64: string; mimeType: string } | undefined, kind: string): string | null {
  if (!p) return null;
  if (!ACCEPTED_MIME.has(p.mimeType)) return `Unsupported ${kind} menu file type. Upload a PDF, PNG, JPG, or WEBP.`;
  const approxBytes = Math.floor((p.fileBase64.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    return `Your ${kind} menu is too large (over 20 MB). Try a smaller PDF or a phone photo (photos are auto-compressed).`;
  }
  return null;
}

export const generateMenuQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<GenerateMenuQuizResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) return { ok: false, error: "AI is not configured on this project (missing LOVABLE_API_KEY)." };

    const foodErr = validatePayload(data.food, "food");
    if (foodErr) return { ok: false, error: foodErr };
    const drinkErr = validatePayload(data.drink, "drink");
    if (drinkErr) return { ok: false, error: drinkErr };
    const dessertErr = validatePayload(data.dessert, "dessert");
    if (dessertErr) return { ok: false, error: dessertErr };

    const kinds: Array<"food" | "drink" | "dessert"> = [];
    if (data.food) kinds.push("food");
    if (data.drink) kinds.push("drink");
    if (data.dessert) kinds.push("dessert");
    const systemPrompt = buildSystemPrompt(kinds);

    const intro = data.restaurantName
      ? `Restaurant: "${data.restaurantName}". Build the Menu Knowledge Test from the menu(s) below.`
      : `Build the Menu Knowledge Test from the menu(s) below.`;
    const userContent: UserBlock[] = [{ type: "text", text: intro }];
    if (data.food) userContent.push(...fileBlocks("Food menu (tag questions from this as source=\"food\"):", "food-menu", data.food));
    if (data.drink) userContent.push(...fileBlocks("Drink menu (tag questions from this as source=\"drink\"):", "drink-menu", data.drink));
    if (data.dessert) userContent.push(...fileBlocks("Dessert menu (tag questions from this as source=\"dessert\"):", "dessert-menu", data.dessert));


    let resp: Response;
    try {
      resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${lovableKey}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      console.error("[menu-quiz] fetch failed", e instanceof Error ? e.message : String(e));
      return { ok: false, error: "Couldn't reach the AI service. Check your connection and retry." };
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[menu-quiz] gateway ${resp.status}: ${errText}`);
      if (resp.status === 429) return { ok: false, error: "AI is rate-limited right now — wait a moment and retry." };
      if (resp.status === 402) return { ok: false, error: "AI credits exhausted. Add credits in Lovable to continue." };
      if (resp.status === 400) return { ok: false, error: "The AI rejected one of your files. Try a clearer scan or a smaller PDF." };
      return { ok: false, error: `AI request failed (${resp.status}). Try again.` };
    }

    let json: { choices?: Array<{ message?: { content?: string } }> };
    try { json = (await resp.json()) as typeof json; }
    catch { return { ok: false, error: "AI returned an unreadable response. Try again." }; }
    const raw = json.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return { ok: false, error: "AI returned an empty response. Try again with a clearer menu." };
    }

    let parsed: unknown;
    try { parsed = extractJson(raw); }
    catch {
      console.error("[menu-quiz] json parse failed", raw.slice(0, 400));
      return { ok: false, error: "AI couldn't produce a valid quiz from this file. Try a clearer scan." };
    }

    const shaped = modelResponseSchema.safeParse(parsed);
    if (!shaped.success) {
      console.error("[menu-quiz] shape mismatch", shaped.error.issues);
      return { ok: false, error: "The generated quiz was malformed. Please retry." };
    }
    if (shaped.data.questions.length === 0) {
      return { ok: false, error: "Couldn't read a menu in those files. Upload clearer photos or the original PDFs." };
    }

    const questions = shaped.data.questions.map((q) => {
      // If somehow the model tagged wrong, fall back to the only uploaded menu.
      const source = kinds.includes(q.source) ? q.source : kinds.length === 1 ? kinds[0] : q.source;
      return {
        question: q.question.slice(0, 240),
        options: q.options.slice(0, 4).map((o) => o.slice(0, 140)),
        answerIndex: Math.max(0, Math.min(3, q.answerIndex)),
        source,
      };
    }).filter((q) => kinds.includes(q.source));

    if (questions.length === 0) {
      return { ok: false, error: "Couldn't read a menu in those files. Upload clearer photos or the original PDFs." };
    }

    const foodCount = questions.filter((q) => q.source === "food").length;
    const drinkCount = questions.filter((q) => q.source === "drink").length;
    const dessertCount = questions.filter((q) => q.source === "dessert").length;

    return {
      ok: true,
      foodCount,
      drinkCount,
      dessertCount,
      questions,
    };
  });

// Owner-only publish step. Persists the (possibly edited) question set as the
// live Menu Knowledge Test and bumps bank_version so every prior staff pass
// becomes stale and schedule-eligibility re-locks until each employee retakes.
const publishInputSchema = z.object({
  questions: z.array(questionSchema).min(1).max(60),
});

export const publishMenuQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => publishInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<PublishMenuQuizResult> => {
    const questions = data.questions.map((q) => ({
      question: q.question.slice(0, 240),
      options: q.options.slice(0, 4).map((o) => o.slice(0, 140)),
      answerIndex: Math.max(0, Math.min(3, q.answerIndex)),
      source: q.source,
    }));
    const foodCount = questions.filter((q) => q.source === "food").length;
    const drinkCount = questions.filter((q) => q.source === "drink").length;
    const dessertCount = questions.filter((q) => q.source === "dessert").length;

    const { data: existing, error: readErr } = await context.supabase
      .from("menu_quiz_banks")
      .select("bank_version")
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (readErr) {
      console.error("[menu-quiz] read existing bank failed", readErr);
      return { ok: false, error: "Couldn't read the current version. Try again." };
    }
    const nextVersion = (existing?.bank_version ?? 0) + 1;

    const { error: bankErr } = await context.supabase
      .from("menu_quiz_banks")
      .upsert(
        {
          owner_id: context.userId,
          questions,
          bank_version: nextVersion,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      );
    if (bankErr) {
      console.error("[menu-quiz] failed to persist bank", bankErr);
      return { ok: false, error: "Couldn't save the quiz. Try again." };
    }

    return { ok: true, bankVersion: nextVersion, foodCount, drinkCount, dessertCount };
  });


