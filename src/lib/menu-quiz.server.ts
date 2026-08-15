// Server-only implementation of Menu Knowledge Test generation.
//
// Two-stage pipeline:
//   STAGE 1 (extraction): Gemini reads the uploaded file(s) and returns a
//     structured record of every printed item — name, section, ingredients,
//     preparation, and a derived menu_type. No questions in this pass.
//   STAGE 2 (generation): questions are written FROM THE EXTRACTED RECORD
//     ONLY, one item at a time, so ingredients can never bleed between items.
//     Each question's source comes from its item's menu_type (never from an
//     upload slot).
// Then: anti-self-answering + ingredient-provenance validator -> ONE
// regeneration pass for rejects -> revalidate -> owner preview -> publish.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractedItemSchema,
  questionSchema,
  type ExtractedItem,
  type ExtractMenuResult,
  type FilePayload,
  type GenerateMenuQuizResult,
  type MenuQuizDraftQuestion,
  type MenuSource,
  type PublishMenuQuizResult,
  type RegenerateQuestionResult,
} from "./menu-quiz.schemas";
import {
  buildProvenanceIndex,
  partitionQuestions,
  rejectionReason,
  type ProvenanceIndex,
} from "./menu-quiz-validate";
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

/** Overall safety ceiling on the generated bank. */
const MAX_BANK_QUESTIONS = 150;
const ITEMS_PER_BATCH = 12;
/** Max batches in flight at once (rate-limit protection). */
const BATCH_CONCURRENCY = 2;

/* --------------------------------- shared -------------------------------- */

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

function validatePayload(p: FilePayload | undefined, label: string): string | null {
  if (!p) return null;
  if (!ACCEPTED_MIME.has(p.mimeType)) return `Unsupported file type for ${label}. Upload a PDF, PNG, JPG, or WEBP.`;
  const approxBytes = Math.floor((p.fileBase64.length * 3) / 4);
  if (approxBytes > MAX_FILE_BYTES) {
    return `"${label}" is too large (over 20 MB). Try a smaller PDF or a phone photo (photos are auto-compressed).`;
  }
  return null;
}

type RawResult = { ok: true; raw: unknown } | { ok: false; error: string };

async function callGateway(
  key: string,
  systemPrompt: string,
  userContent: UserBlock[],
): Promise<RawResult> {
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

  try { return { ok: true, raw: extractJson(raw) }; }
  catch {
    console.error("[menu-quiz] json parse failed", raw.slice(0, 400));
    return { ok: false, error: "AI couldn't produce a valid result from this file. Try a clearer scan." };
  }
}

/* ------------------------------ stage 1: extract -------------------------- */

const rawExtractedItemSchema = z
  .object({
    name: z.string().min(1),
    section: z.string().optional(),
    ingredients: z.union([z.array(z.string()), z.string()]).optional(),
    preparation: z.string().optional(),
    menu_type: z.enum(["food", "drink", "dessert"]).optional(),
    menuType: z.enum(["food", "drink", "dessert"]).optional(),
  })
  .transform((i) => ({
    name: i.name.trim().slice(0, 160),
    section: (i.section ?? "").trim().slice(0, 120),
    ingredients: (Array.isArray(i.ingredients) ? i.ingredients : i.ingredients ? [i.ingredients] : [])
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 40)
      .map((x) => x.slice(0, 120)),
    preparation: (i.preparation ?? "").trim().slice(0, 400),
    menuType: (i.menu_type ?? i.menuType ?? "food") as MenuSource,
  }));

const extractResponseSchema = z.object({
  items: z.array(rawExtractedItemSchema).max(400),
});

const EXTRACTION_PROMPT = `You are a menu data extractor. You read restaurant menu files (PDF or photo) and return STRUCTURED JSON ONLY. You do NOT write questions.

For EVERY item printed on the file(s), return one object:
- "name": the exact item name as printed.
- "section": the section heading exactly as printed above that item (e.g. "APPETIZERS", "DESSERTS", "COCKTAILS", "DRAFT BEER"). If there is no heading, use "".
- "ingredients": an array of the components/ingredients EXACTLY AS PRINTED in that item's own description, split into individual terms. If the menu prints NO description for the item, return an empty array. NEVER infer, guess, or invent ingredients, and never copy another item's ingredients.
- "preparation": any preparation/cooking/method detail as printed (e.g. "wood-fired", "slow braised"), or "".
- "menu_type": one of "food" | "drink" | "dessert", derived from the SECTION HEADING:
  - Desserts, pastries, ice cream, cakes -> "dessert" even when printed on a food menu.
  - Cocktails, beer, wine, spirits, coffee, soda, and any other beverage -> "drink".
  - Everything else edible -> "food".

Rules:
- One combined file may contain food, drink and dessert sections. Classify each item independently by its own section.
- Do not include prices. Do not include seasonal/market-price placeholders as ingredients.
- Skip unreadable or non-menu pages. If nothing is readable, return {"items": []}.
- Return STRICT JSON only, no prose, no markdown fences:
{"items":[{"name":"...","section":"...","ingredients":["...","..."],"preparation":"","menu_type":"food"}]}`;

export async function runExtractMenu(data: {
  files: FilePayload[];
  restaurantName?: string;
}): Promise<ExtractMenuResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) return { ok: false, error: "AI is not configured on this project (missing LOVABLE_API_KEY)." };

  for (const f of data.files) {
    const err = validatePayload(f, f.filename || "menu");
    if (err) return { ok: false, error: err };
  }

  const userContent: UserBlock[] = [
    {
      type: "text",
      text: `${data.restaurantName ? `Restaurant: "${data.restaurantName}". ` : ""}Extract every item from the attached menu file(s).`,
    },
  ];
  data.files.forEach((f, i) => {
    userContent.push(...fileBlocks(`Menu file ${i + 1} (${f.filename || "menu"}):`, f.filename || `menu-${i + 1}`, f));
  });

  const res = await callGateway(lovableKey, EXTRACTION_PROMPT, userContent);
  if (!res.ok) return { ok: false, error: res.error };

  const shaped = extractResponseSchema.safeParse(res.raw);
  if (!shaped.success) {
    console.error("[menu-quiz] extraction shape mismatch", shaped.error.issues.slice(0, 5));
    return { ok: false, error: "The menu reader returned a malformed result. Try again." };
  }

  // De-duplicate by name (keep the richest record).
  const byName = new Map<string, ExtractedItem>();
  for (const item of shaped.data.items) {
    if (!item.name) continue;
    const key = item.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev || prev.ingredients.length < item.ingredients.length) byName.set(key, item);
  }
  const items = [...byName.values()];

  if (items.length === 0) {
    return {
      ok: false,
      error: "Couldn't read any menu items in those files. Upload clearer photos or the original PDF.",
    };
  }

  const sections = [...new Set(items.map((i) => i.section).filter(Boolean))];
  return {
    ok: true,
    items,
    coverage: {
      foodItems: items.filter((i) => i.menuType === "food").length,
      drinkItems: items.filter((i) => i.menuType === "drink").length,
      dessertItems: items.filter((i) => i.menuType === "dessert").length,
      sections,
    },
  };
}

/* ---------------------------- stage 2: generation ------------------------- */

const rawQuestionSchema = z
  .object({
    question: z.string().min(4),
    options: z.array(z.string().min(1)).length(4),
    answerIndex: z.number().int().min(0).max(3),
    source: z.enum(["food", "drink", "dessert"]).optional(),
    source_item: z.string().optional(),
    source_category: z.string().optional(),
    sourceItem: z.string().optional(),
    sourceCategory: z.string().optional(),
    question_type: z.enum(["identify_item", "identify_attribute"]).optional(),
    questionType: z.enum(["identify_item", "identify_attribute"]).optional(),
  })
  .transform((q) => ({
    question: q.question,
    options: q.options,
    answerIndex: q.answerIndex,
    source: (q.source ?? "food") as MenuSource,
    sourceItem: (q.source_item ?? q.sourceItem ?? "").trim().slice(0, 160),
    sourceCategory: (q.source_category ?? q.sourceCategory ?? "").trim().slice(0, 120),
    questionType: (q.question_type ?? q.questionType ?? "identify_item") as QuestionType,
  }));

const modelResponseSchema = z.object({
  questions: z.array(rawQuestionSchema).min(0).max(80),
});

const QUALITY_RULES = `Rules:
- You are given a STRUCTURED RECORD of the menu. Use ONLY the record. Never invent items, ingredients, or details, and never use one item's ingredients for a different item.
- Write each question about EXACTLY ONE item, using only that item's own name, section, ingredients, and preparation.
- An item with an empty ingredients list can only support a section/category question ("Which section is X served from?" phrased without naming X) — otherwise skip it.
- Each question must have exactly 4 options and exactly one correct answer.
- Mix question types: "What's in [dish/drink/dessert]?", "Which item contains [ingredient]?", "Which section does [item] belong to?", "What garnish/side comes with [item]?".
- ANTI-SELF-ANSWERING RULE (critical): the question stem must NOT contain any significant word that also appears in the correct answer. "Significant" means any noun, ingredient name, or dish-name word. Ignore only these stop words: the, a, an, with, and, or, of, in, on, for, to, is, are, which, what, contains, includes, served, side, dish, item, menu.
  - BAD: "Which dish contains roasted garlic?" when the correct answer is "Roasted Garlic Chicken" — the stem gives the answer away.
  - GOOD: ask about the item's OTHER components — "Which entrée is finished with butter and chicken stock?"
  - The stem must also never contain the source item's name, or two or more consecutive words from it.
- INGREDIENT PROVENANCE (critical): every ingredient or component term you put in the stem must come from THAT item's own record. Citing another item's ingredients is an automatic rejection.
- DISTRACTOR QUALITY: every incorrect option must be a REAL item or a REAL ingredient that appears somewhere in the provided record. No invented options, no absurd throwaway options, and never "all of the above" or "none of the above". Prefer distractors from the SAME menu section as the correct answer. If you cannot produce three valid distractors from the record, DROP that question.
- Keep questions concise (under 140 chars) and answers under 90 chars.
- NEVER generate questions about: prices, seasonal/rotating/market-price/chef's-choice/daily-special items, or who a dish is named after (ignore proper names like owners, family members, or regulars; test the food, not the naming).
- NEVER generate a question that asks whether an item is safe for someone with a dietary restriction or allergy, or that frames an ingredient as an allergen. Specifically forbidden:
  - "Is [dish] gluten-free / dairy-free / nut-free / vegan / vegetarian?"
  - "Which item is safe for a guest with a [X] allergy?"
  - "Which dish contains no [allergen]?"
  - "Which of these contains a common allergen?"
  - Any question using the words allergen, allergy, intolerance, celiac, or "safe for"
  - Any question whose correct answer would function as dietary guidance to a guest
- If an item's only distinguishing detail would require framing it as an allergen question, skip that item and use a different one.
- Always focus on what staff genuinely need to answer a guest:
  - FOOD: listed ingredients and components, preparation method, sauce, accompanying sides/garnishes, or which item contains a given ingredient.
  - COCKTAILS: listed ingredients — spirits, mixers, and garnish.
  - BEER: style and brand. WINE: varietal and producer.
  - DESSERTS: listed ingredients and components, same as food.
- Tag every question with "source" (the item's menu_type from the record: food, drink, or dessert), "source_item" (the exact item name) and "source_category" (the item's printed section).
- Return STRICT JSON only, matching this shape exactly, no prose, no markdown fences:
{"questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"source":"food","source_item":"...","source_category":"..."}, ...]}`;

const GENERATION_SYSTEM = `You are a restaurant training coach building the mandatory "Menu Knowledge Test" for a restaurant's floor and kitchen staff. This is a gating test — an employee cannot be scheduled until they pass it — so every question must test genuine, on-menu knowledge drawn from the structured menu record you are given.

${QUALITY_RULES}`;

function itemLine(i: ExtractedItem): string {
  return JSON.stringify({
    name: i.name,
    section: i.section,
    menu_type: i.menuType,
    ingredients: i.ingredients,
    preparation: i.preparation,
  });
}

function distractorPool(items: ExtractedItem[]): string {
  const names = items.map((i) => i.name).slice(0, 120);
  const ings = [...new Set(items.flatMap((i) => i.ingredients))].slice(0, 150);
  return `Valid distractor vocabulary (real items): ${names.join(" | ")}\nValid distractor vocabulary (real ingredients): ${ings.join(" | ")}`;
}

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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

/** Re-tag each question from the extracted record so the badge can never lie. */
function retagFromRecord(q: MenuQuizDraftQuestion, byName: Map<string, ExtractedItem>): MenuQuizDraftQuestion {
  const rec = byName.get(q.sourceItem.toLowerCase());
  if (!rec) return q;
  return { ...q, source: rec.menuType, sourceCategory: rec.section || q.sourceCategory };
}

async function generateForBatch(
  key: string,
  batch: ExtractedItem[],
  allItems: ExtractedItem[],
  restaurantName: string,
  extraInstruction?: string,
): Promise<{ ok: true; questions: MenuQuizDraftQuestion[] } | { ok: false; error: string }> {
  const userContent: UserBlock[] = [
    {
      type: "text",
      text: `${restaurantName ? `Restaurant: "${restaurantName}".\n` : ""}Write ONE question per item below — ${batch.length} question(s) total. Each question may only use its own item's record.

ITEMS (one JSON record per line):
${batch.map(itemLine).join("\n")}

${distractorPool(allItems)}${extraInstruction ? `\n\n${extraInstruction}` : ""}`,
    },
  ];
  const res = await callGateway(key, GENERATION_SYSTEM, userContent);
  if (!res.ok) return { ok: false, error: res.error };
  const shaped = modelResponseSchema.safeParse(res.raw);
  if (!shaped.success) {
    console.error("[menu-quiz] generation shape mismatch", shaped.error.issues.slice(0, 5));
    return { ok: false, error: "The generated quiz was malformed. Please retry." };
  }
  return { ok: true, questions: shaped.data.questions.map(clampQuestion) };
}

function pickCandidates(items: ExtractedItem[]): ExtractedItem[] {
  const usable = items.filter((i) => i.ingredients.length > 0 || i.preparation);
  const out: ExtractedItem[] = [];
  for (const type of ["food", "drink", "dessert"] as const) {
    const ofType = shuffled(usable.filter((i) => i.menuType === type));
    out.push(...ofType.slice(0, MAX_QUESTIONS_PER_TYPE));
  }
  return out;
}

export async function runGenerateMenuQuiz(data: {
  items: ExtractedItem[];
  restaurantName?: string;
}): Promise<GenerateMenuQuizResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) return { ok: false, error: "AI is not configured on this project (missing LOVABLE_API_KEY)." };

  const items = data.items;
  if (items.length === 0) return { ok: false, error: "No extracted menu items to build questions from." };

  const byName = new Map(items.map((i) => [i.name.toLowerCase(), i]));
  const index: ProvenanceIndex = buildProvenanceIndex(items);
  const candidates = pickCandidates(items);
  if (candidates.length === 0) {
    return {
      ok: false,
      error: "None of the extracted items list any ingredients or preparation detail, so there's nothing to test. Upload a menu with item descriptions.",
    };
  }

  const restaurantName = data.restaurantName ?? "";
  const batches: ExtractedItem[][] = [];
  for (let i = 0; i < candidates.length; i += ITEMS_PER_BATCH) {
    batches.push(candidates.slice(i, i + ITEMS_PER_BATCH));
  }

  const results = await Promise.all(
    batches.map((b) => generateForBatch(lovableKey, b, items, restaurantName)),
  );
  const produced: MenuQuizDraftQuestion[] = [];
  let lastError: string | null = null;
  for (const r of results) {
    if (r.ok) produced.push(...r.questions.map((q) => retagFromRecord(q, byName)));
    else lastError = r.error;
  }
  if (produced.length === 0) {
    return { ok: false, error: lastError ?? "The AI couldn't write questions from this menu. Try a clearer scan." };
  }

  const { passed, rejected } = partitionQuestions(produced, index);
  let rejectedCount = rejected.length;
  const final = [...passed];

  if (rejected.length > 0) {
    console.warn(`[menu-quiz] validator rejected ${rejected.length}/${produced.length} questions on first pass`);
    const retryItems = rejected
      .map((r) => byName.get(r.question.sourceItem.toLowerCase()))
      .filter((i): i is ExtractedItem => Boolean(i))
      .slice(0, ITEMS_PER_BATCH * 3);
    const listing = rejected
      .map((r, i) => `${i + 1}. item="${r.question.sourceItem}" question="${r.question.question}" correct_answer="${r.question.options[r.question.answerIndex] ?? ""}" REJECTED_BECAUSE: ${r.reason}`)
      .join("\n");
    if (retryItems.length > 0) {
      const retryBatches: ExtractedItem[][] = [];
      for (let i = 0; i < retryItems.length; i += ITEMS_PER_BATCH) {
        retryBatches.push(retryItems.slice(i, i + ITEMS_PER_BATCH));
      }
      const retryResults = await Promise.all(
        retryBatches.map((b) =>
          generateForBatch(
            lovableKey,
            b,
            items,
            restaurantName,
            `Your previous attempts at these items were REJECTED by an automated validator. Write clean replacements that fix the stated problems:\n${listing}`,
          ),
        ),
      );
      const retried = retryResults.flatMap((r) => (r.ok ? r.questions.map((q) => retagFromRecord(q, byName)) : []));
      const { passed: retryPassed, rejected: retryRejected } = partitionQuestions(retried, index);
      rejectedCount += retryRejected.length;
      final.push(...retryPassed);
    }
  }

  if (final.length === 0) {
    return { ok: false, error: "Every generated question failed quality checks. Try a clearer menu scan and regenerate." };
  }

  return {
    ok: true,
    questions: shuffled(final),
    foodCount: final.filter((q) => q.source === "food").length,
    drinkCount: final.filter((q) => q.source === "drink").length,
    dessertCount: final.filter((q) => q.source === "dessert").length,
    rejectedCount,
  };
}

export async function runRegenerateOne(data: {
  item: ExtractedItem;
  avoid?: string[];
  restaurantName?: string;
}): Promise<RegenerateQuestionResult> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) return { ok: false, error: "AI is not configured on this project (missing LOVABLE_API_KEY)." };

  const item = extractedItemSchema.safeParse(data.item);
  if (!item.success) return { ok: false, error: "That question isn't linked to an extracted menu item. Remove it instead." };
  const rec = item.data;
  const index = buildProvenanceIndex([rec]);
  const avoidText = (data.avoid ?? []).slice(0, 40).map((a) => `- ${a}`).join("\n");

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateForBatch(
      lovableKey,
      [rec],
      [rec],
      data.restaurantName ?? "",
      avoidText ? `Do NOT repeat any of these existing questions:\n${avoidText}` : undefined,
    );
    if (!res.ok) return { ok: false, error: res.error };
    const candidate = res.questions
      .map((q) => ({ ...q, source: rec.menuType, sourceItem: rec.name, sourceCategory: rec.section }))
      .find((q) => rejectionReason(q, index) === null);
    if (candidate) return { ok: true, question: candidate };
    console.warn(`[menu-quiz] single-question regeneration attempt ${attempt + 1} failed the validator`);
  }
  return { ok: false, error: "The AI couldn't write a clean replacement for this item. Remove the question instead." };
}

/* --------------------------------- publish -------------------------------- */

export async function runPublishMenuQuiz(
  supabase: SupabaseClient,
  userId: string,
  questionsIn: unknown,
): Promise<PublishMenuQuizResult> {
  const parsed = z.array(questionSchema).min(1).max(120).safeParse(questionsIn);
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
