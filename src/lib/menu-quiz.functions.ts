// Server function: generate real menu-quiz questions from an uploaded menu
// (PDF or image) using the Lovable AI Gateway. The client sends the file as
// base64 with its MIME type; we forward it to a multimodal chat model and
// ask for a strict JSON payload of quiz questions.
//
// This powers the demo-closing "upload your menu, watch a quiz appear"
// moment, so the model call must succeed reliably and fail loudly with a
// clear error the UI can surface + retry from.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
// Gemini 2.5 Flash: multimodal (image + PDF), fast, cheap. Good default for
// this kind of one-shot structured extraction.
const MODEL = "google/gemini-2.5-flash";

// Gemini 2.5 Flash accepts inline file data up to ~20 MB per request; keep a small
// safety margin so the whole JSON body (base64 + prompt overhead) fits comfortably.
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB after base64 decode
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "application/pdf",
]);

const inputSchema = z.object({
  fileBase64: z.string().min(50),
  mimeType: z.string(),
  restaurantName: z.string().trim().max(200).optional().default(""),
});

const questionSchema = z.object({
  question: z.string().min(4),
  options: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
});
const modelResponseSchema = z.object({
  questions: z.array(questionSchema).min(5).max(25),
});

export type MenuQuizQuestion = z.infer<typeof questionSchema>;
export type MenuQuizPreviewQuestion = Pick<MenuQuizQuestion, "question" | "options">;
export type GenerateMenuQuizResult =
  | { ok: true; questions: MenuQuizPreviewQuestion[] }
  | { ok: false; error: string };

const SYSTEM_PROMPT = `You are a restaurant training coach building a menu quiz for new servers, bartenders, and line cooks. You will be given a photo or PDF of an actual restaurant menu. Read every dish, drink, and description you can see, then write multiple-choice quiz questions that test genuine knowledge of THIS restaurant's menu — ingredients, dish names, categories, and short descriptions.

Rules:
- Only use dishes, drinks, and details that ACTUALLY appear on the menu you were given. Never invent items.
- If the file is blurry, unreadable, or clearly not a restaurant menu, return {"questions": []} with no items.
- Write exactly 15 questions. Each must have exactly 4 options and exactly one correct answer.
- Mix question types: "What's in [dish]?", "Which dish contains [ingredient]?", "Which category does [item] belong to?", "What does [dish] come with?".
- Distractors must be plausible — prefer other items or ingredients from the same menu.
- Keep questions concise (under 140 chars) and answers under 90 chars.
- Return STRICT JSON only, matching this shape exactly, no prose, no markdown fences:
{"questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0}, ...]}`;

function buildUserContent(fileBase64: string, mimeType: string, restaurantName: string) {
  const dataUrl = `data:${mimeType};base64,${fileBase64}`;
  const intro = restaurantName
    ? `This is the menu for "${restaurantName}". Build the quiz from it.`
    : "This is the restaurant's menu. Build the quiz from it.";

  if (mimeType === "application/pdf") {
    return [
      { type: "text", text: intro },
      { type: "file", file: { filename: "menu.pdf", file_data: dataUrl } },
    ];
  }
  return [
    { type: "text", text: intro },
    { type: "image_url", image_url: { url: dataUrl } },
  ];
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Model sometimes wraps JSON in ```json fences despite instructions.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        /* fall through */
      }
    }
    // Last-ditch: find the outermost JSON object.
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        /* fall through */
      }
    }
    throw new Error("Model did not return valid JSON.");
  }
}

export const generateMenuQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<GenerateMenuQuizResult> => {
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (!lovableKey) return { ok: false, error: "AI is not configured on this project (missing LOVABLE_API_KEY)." };

    if (!ACCEPTED_MIME.has(data.mimeType)) {
      return { ok: false, error: "Unsupported file type. Upload a PDF, PNG, JPG, or WEBP." };
    }
    const approxBytes = Math.floor((data.fileBase64.length * 3) / 4);
    const isPdf = data.mimeType === "application/pdf";
    const limit = isPdf ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
    if (approxBytes > limit) {
      if (isPdf) {
        return {
          ok: false,
          error:
            "This PDF is too large (over 20 MB). Try re-exporting it at a lower resolution, printing to PDF at 'smallest file size', or snap a phone photo of the menu instead — photos are auto-compressed.",
        };
      }
      return { ok: false, error: "Image is too large after compression (over 20 MB). Try a smaller photo." };
    }
    // Kept for legacy reference
    void MAX_FILE_BYTES;

    let resp: Response;
    try {
      resp = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserContent(data.fileBase64, data.mimeType, data.restaurantName) },
          ],
          response_format: { type: "json_object" },
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[menu-quiz] fetch failed", msg);
      return { ok: false, error: "Couldn't reach the AI service. Check your connection and retry." };
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error(`[menu-quiz] gateway ${resp.status}: ${errText}`);
      if (resp.status === 429) return { ok: false, error: "AI is rate-limited right now — wait a moment and retry." };
      if (resp.status === 402) return { ok: false, error: "AI credits exhausted. Add credits in Lovable to continue." };
      if (resp.status === 400) return { ok: false, error: "The AI rejected this file. Try a clearer scan or a smaller PDF." };
      return { ok: false, error: `AI request failed (${resp.status}). Try again.` };
    }

    let json: { choices?: Array<{ message?: { content?: string } }> };
    try {
      json = (await resp.json()) as typeof json;
    } catch {
      return { ok: false, error: "AI returned an unreadable response. Try again." };
    }
    const raw = json.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") {
      return { ok: false, error: "AI returned an empty response. Try again with a clearer menu." };
    }

    let parsed: unknown;
    try {
      parsed = extractJson(raw);
    } catch (e) {
      console.error("[menu-quiz] json parse failed", raw.slice(0, 400));
      return { ok: false, error: "AI couldn't produce a valid quiz from this file. Try a clearer scan." };
    }

    const shaped = modelResponseSchema.safeParse(parsed);
    if (!shaped.success) {
      console.error("[menu-quiz] shape mismatch", shaped.error.issues);
      return { ok: false, error: "The generated quiz was malformed. Please retry." };
    }
    if (shaped.data.questions.length === 0) {
      return {
        ok: false,
        error: "Couldn't read a menu in that file. Upload a clearer photo or the original PDF.",
      };
    }

    // Extra safety: clamp answerIndex to a valid option.
    const questions = shaped.data.questions.map((q) => ({
      question: q.question.slice(0, 240),
      options: q.options.slice(0, 4).map((o) => o.slice(0, 140)),
      answerIndex: Math.max(0, Math.min(3, q.answerIndex)),
    }));

    // Persist the answer key server-side. Employees never receive
    // answerIndex in their client bundle — startQuizAttempt reads from
    // menu_quiz_banks and returns shuffled options only.
    const { error: bankErr } = await context.supabase
      .from("menu_quiz_banks")
      .upsert(
        {
          owner_id: context.userId,
          questions,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id" },
      );
    if (bankErr) {
      console.error("[menu-quiz] failed to persist bank", bankErr);
      return { ok: false, error: "Generated the quiz but couldn't save it. Try again." };
    }

    return {
      ok: true,
      questions: questions.map(({ question, options }) => ({ question, options })),
    };
  });
