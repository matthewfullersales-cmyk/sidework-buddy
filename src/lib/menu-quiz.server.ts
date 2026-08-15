// Server-only implementation of Menu Knowledge Test generation.
//
// Flow: upload -> Gemini 2.5 Flash reads the menu(s) -> question bank ->
// server-side anti-self-answering validator -> ONE regeneration pass for
// rejected questions -> revalidate -> owner preview -> publish.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  questionSchema,
  type FilePayload,
  type GenerateMenuQuizResult,
  type MenuQuizDraftQuestion,
  type MenuSource,
  type PublishMenuQuizResult,
  type RegenerateQuestionResult,
} from "./menu-quiz.schemas";
import { partitionQuestions, rejectionReason } from "./menu-quiz-validate";
import { z } from "zod";

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

const rawQuestionSchema = z
  .object({
    question: z.string().min(4),
    options: z.array(z.string().min(1)).length(4),
    answerIndex: z.number().int().min(0).max(3),
    source: z.enum(["food", "drink", "dessert"]),
    source_item: z.string().optional(),
    source_category: z.string().optional(),
    sourceItem: z.string().optional(),
    sourceCategory: z.string().optional(),
  })
  .transform((q) => ({
    question: q.question,
    options: q.options,
    answerIndex: q.answerIndex,
    source: q.source,
    sourceItem: (q.source_item ?? q.sourceItem ?? "").trim().slice(0, 160),
    sourceCategory: (q.source_category ?? q.sourceCategory ?? "").trim().slice(0, 120),
  }));

const modelResponseSchema = z.object({
  questions: z.array(rawQuestionSchema).min(0).max(80),
});

const QUALITY_RULES = `Rules:
- Only use items and details that ACTUALLY appear on the menus you were given. Never invent items.
- If a menu item has no ingredient detail printed, do NOT invent any — skip that item and build the question from an item that does list its components.
- If a file is blurry, unreadable, or clearly not a menu, skip that file. If no file yields anything usable, return {"questions": []}.
- Each question must have exactly 4 options and exactly one correct answer.
- Mix question types: "What's in [dish/drink/dessert]?", "Which item contains [ingredient]?", "Which category does [item] belong to?", "What garnish/side comes with [item]?".
- ANTI-SELF-ANSWERING RULE (critical): the question stem must NOT contain any significant word that also appears in the correct answer. "Significant" means any noun, ingredient name, or dish-name word. Ignore only these stop words: the, a, an, with, and, or, of, in, on, for, to, is, are, which, what, contains, includes, served, side, dish, item, menu.
  - BAD: "Which dish contains roasted garlic?" when the correct answer is "Roasted Garlic Chicken" — the stem gives the answer away.
  - GOOD: ask about the item's OTHER components — "Which entrée is finished with butter and chicken stock?"
  - The stem must also never contain the source item's name, or two or more consecutive words from it.
- DISTRACTOR QUALITY: every incorrect option must be a REAL item or a REAL ingredient that actually appears on the uploaded menu. No invented options, no absurd throwaway options, and never "all of the above" or "none of the above". Prefer distractors from the SAME menu section as the correct answer. If you cannot produce three valid distractors from the menu for a question, DROP that question instead of inventing options.
- Keep questions concise (under 140 chars) and answers under 90 chars.
- NEVER generate questions about: prices, seasonal/rotating/market-price/chef's-choice/daily-special items, or who a dish is named after (ignore proper names like owners, family members, or regulars; test the food, not the naming).
- NEVER generate a question that asks whether an item is safe for someone with a dietary restriction or allergy, or that frames an ingredient as an allergen. Specifically forbidden:
  - "Is [dish] gluten-free / dairy-free / nut-free / vegan / vegetarian?"
  - "Which item is safe for a guest with a [X] allergy?"
  - "Which dish contains no [allergen]?"
  - "Which of these contains a common allergen?"
  - Any question using the words allergen, allergy, intolerance, celiac, or "safe for"
  - Any question whose correct answer would function as dietary guidance to a guest
- If an item's only distinguishing detail would require framing it as an allergen question, skip that item and build the question from a different one.
- Always focus on what staff genuinely need to answer a guest:
  - FOOD: listed ingredients and components, preparation method, sauce, accompanying sides/garnishes, or which item contains a given ingredient.
  - COCKTAILS: listed ingredients — spirits, mixers, and garnish.
  - BEER: style and brand.
  - WINE: varietal and producer.
  - DESSERTS: listed ingredients and components, same as food.
- Tag every question with "source_item" (the exact menu item name the question is about) and "source_category" (the menu section it came from).
- Return STRICT JSON only, matching this shape exactly, no prose, no markdown fences:
{"questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"source":"food","source_item":"...","source_category":"..."}, ...]}`;

function buildSystemPrompt(kinds: MenuSource[]): string {
  const names: Record<string, string> = { food: "food menu", drink: "drink menu", dessert: "dessert menu" };
  const list = kinds.map((k) => names[k]).join(", ");
  const perMenu = 18;
  const coverage = `You will be given ${kinds.length} menu file(s): ${list}. Write between 15 and 20 questions (aim for ${perMenu}) PER menu file (roughly ${perMenu * kinds.length} total). Every question must reference an item that appears in the menu it was drawn from. Tag each question with a "source" field of exactly ${kinds.map((k) => `"${k}"`).join(", ")} depending on which uploaded menu it came from. Never emit a source that was not uploaded.`;
  return `You are a restaurant training coach building the mandatory "Menu Knowledge Test" for a restaurant's floor and kitchen staff. This is a gating test — an employee cannot be scheduled until they pass it — so every question must test genuine, on-menu knowledge.

${coverage}

${QUALITY_RULES}`;
}

type UserBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

function fileBlocks(label: string, filename: string, payload: FilePayload): UserBlock[] {
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

function validatePayload(p: FilePayload | undefined, kind: string): string | null {
  if (!p) return null;
  if (!ACCEPTED_MIME.has(p.mimeType)) return `Unsupported ${kind} menu file type. Upload a PDF, PNG, JPG, or WEBP.`;
  const approxBytes = Math.floor((p.fileBase64.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    return `Your ${kind} menu is too large (over 20 MB). Try a smaller PDF or a phone photo (photos are auto-compressed).`;
  }
  return null;
}

type GatewayResult =
  | { ok: true; questions: MenuQuizDraftQuestion[] }
  | { ok: false; error: string };

async function callGateway(
  key: string,
  systemPrompt: string,
  userContent: UserBlock[],
): Promise<GatewayResult> {
  let resp: Response;
  try {
    resp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
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
  return { ok: true, questions: shaped.data.questions.map(clampQuestion) };
}

function clampQuestion(q: {
  question: string; options: string[]; answerIndex: number; source: MenuSource;
  sourceItem: string; sourceCategory: string;
}): MenuQuizDraftQuestion {
  return {
    question: q.question.slice(0, 240),
    options: q.options.slice(0, 4).map((o) => o.slice(0, 140)),
    answerIndex: Math.max(0, Math.min(3, q.answerIndex)),
    source: q.source,
    sourceItem: q.sourceItem.slice(0, 160),
    sourceCategory: q.sourceCategory.slice(0, 120),
  };
}

export async function runGenerateMenuQuiz(data: {
  food?: FilePayload; drink?: FilePayload; dessert?: FilePayload; restaurantName?: string;
}): Promise<GenerateMenuQuizResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) return { ok: false, error: "AI is not configured on this project (missing LOVABLE_API_KEY)." };

  for (const kind of ["food", "drink", "dessert"] as const) {
    const err = validatePayload(data[kind], kind);
    if (err) return { ok: false, error: err };
  }

  const kinds: MenuSource[] = [];
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

  const first = await callGateway(lovableKey, systemPrompt, userContent);
  if (!first.ok) return first;

  const tagged = first.questions.filter((q) => kinds.includes(q.source));
  if (tagged.length === 0) {
    return { ok: false, error: "Couldn't read a menu in those files. Upload clearer photos or the original PDFs." };
  }

  const { passed, rejected } = partitionQuestions(tagged);
  let rejectedCount = rejected.length;
  const final = [...passed];

  if (rejected.length > 0) {
    console.warn(`[menu-quiz] validator rejected ${rejected.length}/${tagged.length} questions on first pass`);
    const listing = rejected
      .map((r, i) =>
        `${i + 1}. source="${r.question.source}" source_item="${r.question.sourceItem}" question="${r.question.question}" correct_answer="${r.question.options[r.question.answerIndex] ?? ""}" REJECTED_BECAUSE: ${r.reason}`,
      )
      .join("\n");
    const regenContent: UserBlock[] = [
      {
        type: "text",
        text: `These ${rejected.length} question(s) you just wrote were REJECTED by an automated validator. Write exactly ${rejected.length} REPLACEMENT question(s) — one per rejected question, about the SAME source_item and source, but phrased so the stem shares no significant word with the correct answer and never names the item.\n\n${listing}`,
      },
      ...userContent.slice(1),
    ];
    const second = await callGateway(lovableKey, systemPrompt, regenContent);
    if (second.ok) {
      const retried = second.questions.filter((q) => kinds.includes(q.source));
      const { passed: retryPassed, rejected: retryRejected } = partitionQuestions(retried);
      rejectedCount += retryRejected.length;
      if (retryRejected.length > 0) {
        console.warn(`[menu-quiz] validator dropped ${retryRejected.length} replacement question(s) after second pass`);
      }
      final.push(...retryPassed);
    } else {
      console.warn("[menu-quiz] regeneration pass failed:", second.error);
    }
  }

  if (final.length === 0) {
    return { ok: false, error: "Every generated question failed quality checks. Try a clearer menu scan and regenerate." };
  }

  return {
    ok: true,
    questions: final,
    foodCount: final.filter((q) => q.source === "food").length,
    drinkCount: final.filter((q) => q.source === "drink").length,
    dessertCount: final.filter((q) => q.source === "dessert").length,
    rejectedCount,
  };
}

export async function runRegenerateOne(data: {
  file: FilePayload;
  source: MenuSource;
  sourceItem: string;
  sourceCategory?: string;
  avoid?: string[];
  restaurantName?: string;
}): Promise<RegenerateQuestionResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) return { ok: false, error: "AI is not configured on this project (missing LOVABLE_API_KEY)." };
  const err = validatePayload(data.file, data.source);
  if (err) return { ok: false, error: err };

  const systemPrompt = `You are a restaurant training coach writing ONE replacement question for a restaurant's mandatory "Menu Knowledge Test".

Write exactly 1 question, drawn from the attached ${data.source} menu, about the menu item "${data.sourceItem || "any clearly detailed item"}"${data.sourceCategory ? ` (menu section: ${data.sourceCategory})` : ""}. Tag it with source="${data.source}".

${QUALITY_RULES}`;

  const avoidText = (data.avoid ?? []).slice(0, 40).map((a) => `- ${a}`).join("\n");
  const userContent: UserBlock[] = [
    {
      type: "text",
      text: `${data.restaurantName ? `Restaurant: "${data.restaurantName}". ` : ""}Write one replacement question about "${data.sourceItem}".${avoidText ? `\n\nDo NOT repeat any of these existing questions:\n${avoidText}` : ""}`,
    },
    ...fileBlocks(`${data.source} menu:`, `${data.source}-menu`, data.file),
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callGateway(lovableKey, systemPrompt, userContent);
    if (!res.ok) return { ok: false, error: res.error };
    const candidate = res.questions.find((q) => rejectionReason(q) === null);
    if (candidate) {
      return { ok: true, question: { ...candidate, source: data.source } };
    }
    console.warn(`[menu-quiz] single-question regeneration attempt ${attempt + 1} failed the validator`);
  }
  return { ok: false, error: "The AI couldn't write a clean replacement for this item. Remove the question instead." };
}

export async function runPublishMenuQuiz(
  supabase: SupabaseClient,
  userId: string,
  questionsIn: unknown,
): Promise<PublishMenuQuizResult> {
  const parsed = z.array(questionSchema).min(1).max(80).safeParse(questionsIn);
  if (!parsed.success) return { ok: false, error: "Those questions are malformed. Regenerate the draft." };

  const questions = parsed.data.map((q) => ({
    question: q.question.slice(0, 240),
    options: q.options.slice(0, 4).map((o) => o.slice(0, 140)),
    answerIndex: Math.max(0, Math.min(3, q.answerIndex)),
    source: q.source,
    sourceItem: (q.sourceItem ?? "").slice(0, 160),
    sourceCategory: (q.sourceCategory ?? "").slice(0, 120),
  }));
  const foodCount = questions.filter((q) => q.source === "food").length;
  const drinkCount = questions.filter((q) => q.source === "drink").length;
  const dessertCount = questions.filter((q) => q.source === "dessert").length;

  const { data: existing, error: readErr } = await supabase
    .from("menu_quiz_banks")
    .select("bank_version")
    .eq("owner_id", userId)
    .maybeSingle();
  if (readErr) {
    console.error("[menu-quiz] read existing bank failed", readErr);
    return { ok: false, error: "Couldn't read the current version. Try again." };
  }
  const nextVersion = ((existing?.bank_version as number | undefined) ?? 0) + 1;

  const { error: bankErr } = await supabase
    .from("menu_quiz_banks")
    .upsert(
      {
        owner_id: userId,
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
}
