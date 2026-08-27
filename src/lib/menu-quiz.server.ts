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
  type QuestionType,
  type FactSource,

  type RegenerateQuestionResult,
} from "./menu-quiz.schemas";
import {
  buildProvenanceIndex,
  isSectionQuestion,
  normalizeText,
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

type ExtractedJson = { value: unknown; usedBraceFallback: boolean };

function extractJson(raw: string): ExtractedJson {
  const trimmed = raw.trim();
  try {
    return { value: JSON.parse(trimmed), usedBraceFallback: false };
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
    if (fenced) {
      try { return { value: JSON.parse(fenced[1]), usedBraceFallback: false }; } catch { /* fall through */ }
    }
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first !== -1 && last > first) {
      try { return { value: JSON.parse(trimmed.slice(first, last + 1)), usedBraceFallback: true }; } catch { /* fall through */ }
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

type RawResult =
  | {
      ok: true;
      raw: unknown;
      rawTextLength: number;
      rawTextPreview: string;
      usedBraceFallback: boolean;
      nearOutputCeiling: number | null;
    }
  | { ok: false; error: string };

function apparentOutputCeiling(length: number): number | null {
  // JSON responses commonly stop near one of these character boundaries when
  // the model reaches its output-token allowance.
  const likelyCeilings = [8_192, 16_384, 32_768, 65_536, 131_072];
  return likelyCeilings.find((ceiling) => length >= ceiling * 0.95 && length <= ceiling * 1.05) ?? null;
}

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

  try {
    const extracted = extractJson(raw);
    return {
      ok: true,
      raw: extracted.value,
      rawTextLength: raw.length,
      rawTextPreview: raw.slice(0, 600),
      usedBraceFallback: extracted.usedBraceFallback,
      nearOutputCeiling: apparentOutputCeiling(raw.length),
    };
  }
  catch {
    const nearOutputCeiling = apparentOutputCeiling(raw.length);
    console.error("[menu-quiz] json parse failed", {
      length: raw.length,
      preview: raw.slice(0, 600),
      nearOutputCeiling,
    });
    if (nearOutputCeiling !== null) {
      console.warn("[menu-quiz] unparseable extraction response was near an apparent output ceiling", {
        length: raw.length,
        nearOutputCeiling,
      });
    }
    return { ok: false, error: "AI couldn't produce a valid result from this file. Try a clearer scan." };
  }
}

/* ------------------------------ stage 1: extract -------------------------- */

const rawExtractedItemSchema = z
  .object({
    name: z.string().trim().min(1),
    section: z.string().nullish(),
    ingredients: z
      .union([z.array(z.unknown()), z.string(), z.number(), z.boolean()])
      .nullish(),
    preparation: z.string().nullish(),
    description: z.string().nullish(),
    menu_type: z.enum(["food", "drink", "dessert"]).nullish(),
    menuType: z.enum(["food", "drink", "dessert"]).nullish(),
  })
  .transform((i) => ({
    name: i.name.trim().slice(0, 160),
    section: (i.section ?? "").trim().slice(0, 120),
    ingredients: (Array.isArray(i.ingredients)
      ? i.ingredients
      : i.ingredients === null || i.ingredients === undefined || i.ingredients === ""
        ? []
        : [i.ingredients])
      .map((x) => {
        if (typeof x === "object" && x !== null && !Array.isArray(x)) {
          const record = x as Record<string, unknown>;
          const candidate = record.name ?? record.text ?? record.value;
          return typeof candidate === "string" ? candidate.trim() : "";
        }
        return String(x).trim();
      })
      .filter(Boolean)
      .slice(0, 40)
      .map((x) => x.slice(0, 120)),
    preparation: (i.preparation ?? "").trim().slice(0, 400),
    description: (i.description ?? "").trim().slice(0, 400),
    menuType: (i.menu_type ?? i.menuType ?? "food") as MenuSource,
  }));

const extractResponseSchema = z.object({
  items: z.array(z.unknown()),
});

function normalizeExtractionRoot(raw: unknown): { items: unknown[] } | null {
  if (Array.isArray(raw)) {
    console.warn("[menu-quiz] non-standard extraction shape: bare root array", { itemCount: raw.length });
    return { items: raw };
  }
  if (typeof raw !== "object" || raw === null) return null;

  const record = raw as Record<string, unknown>;
  if (Array.isArray(record.items)) return { items: record.items };

  const entries = Object.entries(record);
  if (entries.length === 1 && Array.isArray(entries[0]?.[1])) {
    const [key, items] = entries[0];
    console.warn("[menu-quiz] non-standard extraction shape: single-key array wrapper", {
      key,
      itemCount: items.length,
    });
    return { items };
  }

  if (typeof record.name === "string") {
    console.warn("[menu-quiz] non-standard extraction shape: unwrapped single item object");
    return { items: [record] };
  }

  return null;
}

const EXTRACTION_PROMPT = `You are a menu data extractor. You read restaurant menu files (PDF or photo) and return STRUCTURED JSON ONLY. You do NOT write questions.

For EVERY item printed on the file(s), return one object:
- "name": the exact item name as printed.
- "section": the section heading exactly as printed above that item (e.g. "APPETIZERS", "DESSERTS", "COCKTAILS", "DRAFT BEER"). If there is no heading, use "".
- "ingredients": an array of the components/ingredients EXACTLY AS PRINTED in that item's own description, split into individual terms. If the menu prints NO description for the item, return an empty array. NEVER infer, guess, or invent ingredients, and never copy another item's ingredients.
- "preparation": any preparation/cooking/method detail as printed (e.g. "wood-fired", "slow braised"), or "".
- "description": the item's printed description EXACTLY as written on the menu, verbatim — same words, same order, same prepositions and verbs ("served over", "topped with", "tossed in"). Do NOT rewrite, summarize, reorder, or paraphrase it. If the menu prints no description, return "".
- "menu_type": one of "food" | "drink" | "dessert", derived from the SECTION HEADING:
  - Desserts, pastries, ice cream, cakes -> "dessert" even when printed on a food menu.
  - Cocktails, beer, wine, spirits, coffee, soda, and any other beverage -> "drink".
  - Everything else edible -> "food".

Rules:
- NOT ITEMS — never return these as items: fees, surcharges, upcharges, add-on or split-plate charges, corkage or "twist cap" fees, gratuity or service-charge notes, "market price"/"MP" placeholders, allergen or consumer-advisory disclaimers, hours, reservation notes, and any other menu footnote.
- Never return a truncated or incomplete name. If a line is only a possessive or fragment with no dish name (e.g. "WAYNE DEHOND'S"), either join it with the dish name printed with it or skip it.
- One combined file may contain food, drink and dessert sections. Classify each item independently by its own section.
- Do not include prices. Do not include seasonal/market-price placeholders as ingredients.
- Skip unreadable or non-menu pages. If nothing is readable, return {"items": []}.
- Return STRICT JSON only, no prose, no markdown fences:
{"items":[{"name":"...","section":"...","ingredients":["...","..."],"preparation":"","description":"","menu_type":"food"}]}`;

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

  const normalizedRoot = normalizeExtractionRoot(res.raw);
  const shaped = extractResponseSchema.safeParse(normalizedRoot ?? res.raw);
  if (!shaped.success) {
    console.error("[menu-quiz] extraction shape mismatch", shaped.error.issues.slice(0, 5));
    console.error("[menu-quiz] extraction raw response", {
      length: res.rawTextLength,
      preview: res.rawTextPreview,
      usedBraceFallback: res.usedBraceFallback,
      nearOutputCeiling: res.nearOutputCeiling,
    });
    const first = shaped.error.issues[0];
    const where = first?.path?.length ? first.path.join(".") : "response";
    return {
      ok: false,
      error: `The menu reader returned a malformed result (${where}: ${first?.message ?? "unknown error"}). Try again.`,
    };
  }

  if (res.usedBraceFallback || res.nearOutputCeiling !== null) {
    console.warn("[menu-quiz] extraction response may have involved truncation", {
      length: res.rawTextLength,
      usedBraceFallback: res.usedBraceFallback,
      nearOutputCeiling: res.nearOutputCeiling,
    });
  }

  const parsedItems: ExtractedItem[] = [];
  const itemFailures: Array<{ index: number; path: string; message: string; rawItem: string }> = [];
  shaped.data.items.forEach((rawItem, index) => {
    const parsed = rawExtractedItemSchema.safeParse(rawItem);
    if (parsed.success) {
      if (parsedItems.length < 400) parsedItems.push(parsed.data);
      return;
    }
    const first = parsed.error.issues[0];
    let rawItemJson = "[unserializable item]";
    try { rawItemJson = JSON.stringify(rawItem); } catch { /* keep fallback */ }
    itemFailures.push({
      index,
      path: first?.path?.length ? first.path.join(".") : "item",
      message: first?.message ?? "unknown error",
      rawItem: rawItemJson.slice(0, 300),
    });
  });

  if (itemFailures.length > 0) {
    console.warn(`[menu-quiz] skipped ${itemFailures.length} malformed extracted item(s)`, itemFailures.slice(0, 3));
  }

  if (parsedItems.length === 0) {
    const first = itemFailures[0];
    const detail = first ? `item ${first.index}.${first.path}: ${first.message}` : "items: no valid menu items";
    return {
      ok: false,
      error: `The menu reader returned a malformed result (${detail}). Try again.`,
    };
  }

  // Fees, disclaimers, footnotes and truncated fragments are not testable items.
  const NON_ITEM = /\b(fee|fees|surcharge|upcharge|up-charge|charge|charges|corkage|twist cap|split plate|split-plate|gratuity|service charge|market price|mkt price|\bmp\b|substitution|substitutions|add[- ]?on|allergen|allergy|consumer advisory|undercooked|disclaimer|notice|please note|tax|minimum)\b/i;
  function isRealItem(name: string): boolean {
    const n = name.trim();
    if (n.length < 3) return false;
    if (NON_ITEM.test(n)) return false;
    // truncated fragments: a lone possessive or trailing conjunction/preposition
    if (/^[^\s]+['\u2019]s$/i.test(n)) return false;
    if (/(\band\b|\bwith\b|\bof\b|['\u2019]s|,|&)$/i.test(n)) return false;
    return true;
  }

  // De-duplicate by name (keep the richest record).
  const byName = new Map<string, ExtractedItem>();
  for (const item of parsedItems) {
    if (!item.name || !isRealItem(item.name)) continue;
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
      skippedItems: itemFailures.length,
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
    fact_source: z.enum(["menu", "general_beverage_knowledge"]).optional(),
    factSource: z.enum(["menu", "general_beverage_knowledge"]).optional(),
  })
  .transform((q) => ({
    question: q.question,
    options: q.options,
    answerIndex: q.answerIndex,
    source: (q.source ?? "food") as MenuSource,
    sourceItem: (q.source_item ?? q.sourceItem ?? "").trim().slice(0, 160),
    sourceCategory: (q.source_category ?? q.sourceCategory ?? "").trim().slice(0, 120),
    questionType: (q.question_type ?? q.questionType ?? "identify_item") as QuestionType,
    factSource: (q.fact_source ?? q.factSource ?? "menu") as FactSource,
  }));

const modelResponseSchema = z.object({
  questions: z.array(rawQuestionSchema).min(0).max(80),
});

const QUALITY_RULES = `Rules:
- You are given a STRUCTURED RECORD of the menu. Use ONLY the record. Never invent items, ingredients, or details, and never use one item's ingredients for a different item.
- Write each question about EXACTLY ONE item, using only that item's own name, section, ingredients, and preparation.
- Each question must have exactly 4 options and exactly one correct answer.
- QUESTION DIRECTION — every question MUST carry a "question_type" field with exactly one of two values:
  - "identify_item": the correct answer IS a menu item name. Example: "Which entrée is finished with butter and chicken stock?" -> "Roasted Garlic Chicken". The stem must NOT name the item or use two or more consecutive words from its name.
  - "identify_attribute": the correct answer is an ATTRIBUTE (varietal, producer/winery, beer style, brand, section/course, or ingredient) and the stem NAMES the item. Example: "Kendall-Jackson Vintner's Reserve — which varietal is it?" -> "Chardonnay". Naming the item is required for this shape.
- CHOOSE THE QUESTION TYPE FROM WHAT THE ITEM ACTUALLY HAS:
  - Item HAS ingredients or preparation -> ingredient/preparation question (either direction).
  - WINE (menu_type "drink", section mentions wine) -> ask about varietal, producer/winery, or style (red / white / rosé / sparkling), drawn ONLY from the item name and section. Use "identify_attribute".
  - BEER (menu_type "drink", section mentions beer) -> ask about brand, beer style, or draft vs bottled, drawn ONLY from the item name and section. Use "identify_attribute".
  - Any OTHER drink with no ingredients -> ask which section it is served from, or its category. Use "identify_attribute".
  - FOOD or DESSERT with no ingredients -> ask which section/course it is served from. Use "identify_attribute".
- NEVER invent an attribute that is not present in the item name or its section heading. If an item's name and section together support no honest question, SKIP that item.
- ANTI-SELF-ANSWERING RULE (critical, applies to BOTH types): the question stem must NOT contain any significant word that also appears in the correct answer. "Significant" means any noun, ingredient name, or dish-name word. Ignore only these stop words: the, a, an, with, and, or, of, in, on, for, to, is, are, which, what, contains, includes, served, side, dish, item, menu.
  - BAD: "Which dish contains roasted garlic?" when the correct answer is "Roasted Garlic Chicken" — the stem gives the answer away.
  - GOOD: ask about the item's OTHER components — "Which entrée is finished with butter and chicken stock?"
  - For "identify_attribute": if the varietal word already appears in the item name (e.g. "Chalk Hill Chardonnay"), you CANNOT ask a varietal question for that item — ask about producer or style instead, or skip it.
  - For "identify_item" only: the stem must also never contain the source item's name, or two or more consecutive words from it.
- STRIP THE ANSWER TERM OUT OF THE ITEM NAME (identify_attribute, critical): when the item name already contains the answer, remove that word from the name before writing the stem. BAD: "SHADES OF BLUE REISLING is what varietal?" -> "Riesling". GOOD: "SHADES OF BLUE is what varietal?" -> options Riesling / Chardonnay / Pinot Grigio / Sauvignon Blanc. GOOD: "Caposaldo is a brand of which varietal?" -> "Moscato". Do the same for producer and style questions. If stripping the answer term leaves nothing meaningful to name (the item name IS just the varietal or style), SKIP that item. This rule removes ONLY the literal correct answer term. It never authorizes trimming any other part of the item name. For an identify_attribute question, write the item's FULL printed name in the stem minus the answer term and nothing else. BAD: "JIM & ANGIE ANTONIO'S is tossed with..." when the item is "JIM & ANGIE ANTONIO'S SAUTÉED CALAMARI" and the answer is a pepper type — CALAMARI is not the answer and must stay. GOOD: "JIM & ANGIE ANTONIO'S SAUTÉED CALAMARI is tossed with kalamata olives, onion, and which kind of pepper rings?"
- SECTION / CATEGORY QUESTIONS ARE RARE: at most a handful per menu and never more than one per section. Only ask one when the answer is genuinely non-obvious — if every plausible distractor section would be obviously wrong to someone who has never read the menu, do not write the question. NEVER write an "identify_item" question whose only qualifier is the section or menu type ("Which sweet treat is served from the dessert menu?", "Which product is offered from the BOTTLED BEER section?") — those are unanswerable or guessable and are always rejected.
- BANNED SHAPE (no matter which question_type you assign): a question whose correct answer is a MENU ITEM NAME and whose only qualifier is the section, menu type, or format (bottled / draft / on the list / from the wine list). Labeling it "identify_attribute" does not make it valid. BAD: "Which brand of bottled beer is served?" / "Which brand is served from the BOTTLED BEER section?" — every listed beer is a correct answer. For sections that print no descriptions (bottled beer, draft lists, wine lists), use the REVERSE direction: name the item and ask for its style, brand, or varietal — e.g. "SOUTHERN TIER is what style of beverage?" -> "IPA", "FAT TIRE is a brand of which style?" -> "Amber Ale".
- ANSWERABILITY: for "identify_item", the three distractors must NOT satisfy the condition in the stem. If the stem's qualifier is true of a distractor too, the question is wrong — add the specific detail that only the correct item has, or skip.
- ONE SUBJECT, ONE ANSWER: before writing an attribute question about a producer, winery, or brewery, scan the whole record for other items from that same producer or brand. If it appears more than once with different varietals or styles, you CANNOT ask "X is a producer of which varietal?" because more than one answer is true. Either ask about the full printed item name (only if the answer is not already contained in that name) or SKIP the item. Apply the same rule to breweries with multiple styles on the list.
- NEVER draw a distractor from the source item's own ingredient list. If you ask which ingredient is prepared a certain way, the three wrong answers must be ingredients that do NOT appear anywhere in that item's own printed description. Drawing distractors from the same dish guarantees multiple correct answers. Pull distractors from other items on the menu, or skip the question.
- UNIQUENESS SELF-CHECK (mandatory): before returning any "identify_item" question, re-read the record for each of the three distractors and confirm that NONE of them also satisfies the stem. If any distractor is also a truthful answer, either add the detail that only the correct item has, or drop the question entirely.

- PRINTED RELATIONSHIPS ARE PART OF THE FACT: when the description states an ingredient's relationship to the dish (served over / topped with / stuffed with / tossed in / on the side / drizzled with), the stem MUST use that exact printed relationship. Never substitute a different preposition or verb — "served over marinara" and "topped with marinara" are different claims and must not be swapped.
- SAME-KIND OPTIONS: all four choices must be the same kind of thing. Wine colors/styles with wine colors/styles (red / white / rosé / sparkling), varietals with varietals, producers with producers, section names with section names, ingredients with ingredients, menu items with menu items. BAD: correct answer "Red" with distractors Pinot Grigio, Chardonnay, Rosé.
- NO INVENTED ATTRIBUTES: every descriptive word in the stem must literally appear in that item's record (name, section, ingredients, preparation). If the menu does not print "light lager" or "Neapolitan", you may not write it.
- NATURAL PHRASING: the stem must read like something a server or manager would actually say out loud. If avoiding a word from the correct answer forces unnatural phrasing, do NOT invent a euphemism ("middle neck components", "cheese and ricotta components") — pick a DIFFERENT angle on the same item (another ingredient, the preparation, the accompaniment) or skip the item. Never use vague filler like "components", "elements", or "options" in place of a real word.
- ATTRIBUTE DISTRACTORS: incorrect options for an attribute question must be REAL attributes of the same kind drawn from elsewhere in the record — other varietals actually on the wine list, other real beer styles on the beer list, other real printed section names. Never invented.
- INGREDIENT PROVENANCE (critical): every ingredient or component term you put in the stem must come from THAT item's own record. Citing another item's ingredients is an automatic rejection.
- DISTRACTOR QUALITY: every incorrect option must be a REAL item or a REAL ingredient that appears somewhere in the provided record. No invented options, no absurd throwaway options, and never "all of the above" or "none of the above". Prefer distractors from the SAME menu section as the correct answer. If you cannot produce three valid distractors from the record, DROP that question.
- VANITY / PROPRIETARY NAMES: many menus name dishes after people or families ("BOB & LOUANN'S HOMEMADE TIRAMISU"). Treat such a name as two parts: the PROPRIETARY part ("BOB & LOUANN'S") and the DESCRIPTIVE part ("HOMEMADE TIRAMISU"). Asking staff which dish a proprietary name refers to is a GOOD question — guests order by that name. But phrase it as a natural question about what the name refers to, never as a bare copula. GOOD: "On this menu, which dessert is 'Bob & LouAnn's'?" / "A guest orders 'the Phil & Margaret's' — which item are they asking for?" BAD: "PHIL & MARGARET'S is what type of item?" / "KRISTINA CRISTOFORI'S is what kind of dessert?" — these read as broken sentences. Never leave a possessive dangling with no noun after it.
- NEVER use the word "brand" for a food or dessert item, or for any house-made preparation. "Brand" applies ONLY to commercially branded beverages (Stella Artois, Budweiser, Kendall-Jackson). A house dessert named after a family is not a brand. BAD: "BOB & LOUANN'S is a brand of what type of dessert?"
- NEVER split a compound culinary term across the stem and the answer. Multi-word terms like "white wine butter sauce", "Italian sausage", "bell peppers", "extra virgin olive oil", "balsamic glaze", "San Marzano tomatoes" are single units. Always write the full compound term wherever it appears. BAD: "...tossed in a white wine butter what?" -> "sauce". BAD: "...topped with sliced Italian and fresh bell". If the only thing left to ask is the final generic noun of a phrase (sauce, cheese, pasta, oil, peppers), the question is a grammar puzzle, not menu knowledge — SKIP it and ask about something substantive instead.
- THE ANSWER MUST NOT BE A SYNTACTIC COMPLETION. If a fluent English speaker could supply the correct answer purely from the grammar of the stem without knowing the menu, do not write the question.
- NEVER ask what accompanies an item when the menu states a CHOICE ("choice of two sides", "served with your choice of", "add a side"). Any listed option is a truthful answer, so the question always has multiple correct answers. If the accompaniment is a fixed, specific item the menu names outright, you may ask about it. Otherwise skip.
- NEVER build a question on an add-on, upcharge, optional supplement, or substitution, even when that text appears inside the item's own printed description. Phrases like "add chicken", "add shrimp $8", "substitute", "upgrade to", "extra" followed by a price, and "served with optional" describe an optional purchase, not the dish as served. Ask about the dish as it arrives at the table. If an item's description contains nothing but an add-on line, SKIP that item.
- NEVER reduce an ingredient to a bare modifier. If removing the answer word from an ingredient would leave a dangling adjective or size word — jumbo, sliced, fresh, baby, extra, diced, shredded, ground, roasted, grilled — you may NOT use that ingredient in the stem. BAD: "Which seafood dish contains jumbo and angel hair?" when the printed ingredient is "jumbo shrimp" and the answer is "Shrimp Scampi". Instead choose a DIFFERENT ingredient or preparation detail from the same item that does not collide with the answer — here, "angel hair pasta", the garlic, the butter, the white wine. If no ingredient in the item survives this test, SKIP the item entirely. A missing question costs nothing; a mutilated one reads as broken English to staff.
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
- FACT SOURCE (mandatory): set "fact_source" to "menu" when the correct answer is stated or directly derivable from the item's own printed record. Set it to "general_beverage_knowledge" ONLY when the answer is a widely-known fact about a commercially branded beverage (beer style, wine varietal/region, spirit category, alcoholic/non-alcoholic status) that the menu does not print. Example: the menu prints "STELLA ARTOIS" with no style — "STELLA is a brand of which style of beer?" -> "Lager" is "general_beverage_knowledge". "SOUTHERN TIER IPA is what style?" -> "IPA" is "menu".
- NEVER use general knowledge for FOOD. Every food question must be answerable from the item's own printed description. Do not supply ingredients, preparations, sauces, or "traditional" recipe details that the menu does not state. House versions differ from restaurant to restaurant and a generic recipe is a WRONG answer about this kitchen. The same applies to cocktail recipes and desserts.
- SKIP RATHER THAN GUESS: if you are not confident about a branded beverage fact, write no question for that item. A missing question costs nothing; a wrong one is served to staff as truth.
- Tag every question with "source" (the item's menu_type from the record: food, drink, or dessert), "source_item" (the exact item name), "source_category" (the item's printed section) "question_type" ("identify_item" or "identify_attribute") and "fact_source" ("menu" or "general_beverage_knowledge").
- Return STRICT JSON only, matching this shape exactly, no prose, no markdown fences:
{"questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"source":"food","source_item":"...","source_category":"...","question_type":"identify_item","fact_source":"menu"}, ...]}`;

const GENERATION_SYSTEM = `You are a restaurant training coach building the mandatory "Menu Knowledge Test" for a restaurant's floor and kitchen staff. This is a gating test — an employee cannot be scheduled until they pass it — so every question must test genuine, on-menu knowledge drawn from the structured menu record you are given.

${QUALITY_RULES}`;

function itemLine(i: ExtractedItem): string {
  return JSON.stringify({
    name: i.name,
    section: i.section,
    menu_type: i.menuType,
    ingredients: i.ingredients,
    preparation: i.preparation,
    description: i.description,
  });
}

function distractorPool(items: ExtractedItem[]): string {
  const names = items.map((i) => i.name).slice(0, 150);
  const ings = [...new Set(items.flatMap((i) => i.ingredients))].slice(0, 150);
  const sections = [...new Set(items.map((i) => i.section).filter(Boolean))];
  const wineNames = items
    .filter((i) => i.menuType === "drink" && /wine|red|white|ros|sparkling|champagne/i.test(i.section))
    .map((i) => i.name)
    .slice(0, 60);
  const beerNames = items
    .filter((i) => i.menuType === "drink" && /beer|draft|draught|bottle|can/i.test(i.section))
    .map((i) => i.name)
    .slice(0, 60);
  return [
    `Valid distractor vocabulary (real items): ${names.join(" | ")}`,
    `Valid distractor vocabulary (real ingredients): ${ings.join(" | ")}`,
    `Valid distractor vocabulary (real printed sections): ${sections.join(" | ")}`,
    wineNames.length ? `Wine list entries (source varietals/producers ONLY from these printed names): ${wineNames.join(" | ")}` : "",
    beerNames.length ? `Beer list entries (source brands/styles ONLY from these printed names): ${beerNames.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
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
  sourceItem: string; sourceCategory: string; questionType?: QuestionType; factSource?: FactSource;
}): MenuQuizDraftQuestion {
  return {
    question: q.question.slice(0, 240),
    options: q.options.slice(0, 4).map((o) => o.slice(0, 140)),
    answerIndex: Math.max(0, Math.min(3, q.answerIndex)),
    source: q.source,
    sourceItem: q.sourceItem.slice(0, 160),
    sourceCategory: q.sourceCategory.slice(0, 120),
    questionType: q.questionType ?? "identify_item",
    factSource: q.factSource ?? "menu",
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

/**
 * Every extracted item is a candidate. Items with no printed ingredients are
 * still usable — the prompt asks for an attribute question (varietal, brand,
 * style, section) drawn from the item's own name and section heading.
 * The only requirement is that the item has SOMETHING to ask about.
 */
function pickCandidates(items: ExtractedItem[]): ExtractedItem[] {
  const usable = items.filter(
    (i) => i.ingredients.length > 0 || Boolean(i.preparation) || Boolean(i.section) || i.name.trim().split(/\s+/).length > 1,
  );
  const out: ExtractedItem[] = [];
  for (const type of ["food", "drink", "dessert"] as const) {
    out.push(...shuffled(usable.filter((i) => i.menuType === type)));
  }
  // Interleave types so a truncation at the safety ceiling stays balanced.
  return shuffled(out).slice(0, MAX_BANK_QUESTIONS);
}

/** Run async tasks with a bounded number in flight. */
async function mapWithConcurrency<T, R>(
  inputs: T[],
  limit: number,
  fn: (input: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(inputs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, inputs.length) }, async () => {
    while (cursor < inputs.length) {
      const idx = cursor++;
      results[idx] = await fn(inputs[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

/** One batch, with a single retry before giving up on it. */
async function generateBatchWithRetry(
  key: string,
  batch: ExtractedItem[],
  allItems: ExtractedItem[],
  restaurantName: string,
  extraInstruction?: string,
): Promise<{ ok: true; questions: MenuQuizDraftQuestion[] } | { ok: false; error: string; lost: number }> {
  let lastError = "The AI didn't return questions for one batch.";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await generateForBatch(key, batch, allItems, restaurantName, extraInstruction);
    if (res.ok) return res;
    lastError = res.error;
    console.warn(`[menu-quiz] batch attempt ${attempt + 1} failed: ${res.error}`);
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1200));
  }
  return { ok: false, error: lastError, lost: batch.length };
}

/**
 * "Which section is X in?" questions teach one rule and test nothing, so they
 * are capped at 10% of the bank and one per printed section.
 */
function capSectionQuestions(
  questions: MenuQuizDraftQuestion[],
  index: ProvenanceIndex,
): { questions: MenuQuizDraftQuestion[]; cappedBySection: Record<string, number> } {
  const cap = Math.max(1, Math.floor(questions.length * 0.1));
  const usedSections = new Set<string>();
  const cappedBySection: Record<string, number> = {};
  let kept = 0;
  const out: MenuQuizDraftQuestion[] = [];
  for (const q of questions) {
    if (!isSectionQuestion(q, index)) {
      out.push(q);
      continue;
    }
    const sec = normalizeText(q.options[q.answerIndex] ?? "");
    if (kept >= cap || usedSections.has(sec)) {
      cappedBySection[sec || "(unknown section)"] = (cappedBySection[sec || "(unknown section)"] ?? 0) + 1;
      continue;
    }
    usedSections.add(sec);
    kept += 1;
    out.push(q);
  }
  return { questions: out, cappedBySection };
}


export function dropConflictingStemQuestions<T extends MenuQuizDraftQuestion>(questions: T[]): {
  questions: T[];
  droppedCount: number;
  conflictingStems: string[];
} {
  const groups = new Map<string, T[]>();
  for (const question of questions) {
    const stem = normalizeText(question.question);
    groups.set(stem, [...(groups.get(stem) ?? []), question]);
  }

  const conflictingStems = [...groups.entries()]
    .filter(([, group]) => new Set(group.map((q) => normalizeText(q.options[q.answerIndex] ?? ""))).size > 1)
    .map(([stem]) => stem);
  const conflicts = new Set(conflictingStems);
  const survivors = questions.filter((question) => !conflicts.has(normalizeText(question.question)));
  return {
    questions: survivors,
    droppedCount: questions.length - survivors.length,
    conflictingStems,
  };
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
      error: "None of the extracted items have a name or section we can honestly test. Upload a clearer menu.",
    };
  }

  const restaurantName = data.restaurantName ?? "";
  const batches: ExtractedItem[][] = [];
  for (let i = 0; i < candidates.length; i += ITEMS_PER_BATCH) {
    batches.push(candidates.slice(i, i + ITEMS_PER_BATCH));
  }

  const results = await mapWithConcurrency(batches, BATCH_CONCURRENCY, (b) =>
    generateBatchWithRetry(lovableKey, b, items, restaurantName),
  );
  const produced: MenuQuizDraftQuestion[] = [];
  let lastError: string | null = null;
  let lostToFailedBatches = 0;
  let failedBatches = 0;
  for (const r of results) {
    if (r.ok) produced.push(...r.questions.map((q) => retagFromRecord(q, byName)));
    else {
      lastError = r.error;
      lostToFailedBatches += r.lost;
      failedBatches += 1;
    }
  }
  if (failedBatches > 0) {
    console.error(`[menu-quiz] ${failedBatches}/${batches.length} batches failed after retry (${lostToFailedBatches} items lost): ${lastError}`);
  }
  if (produced.length === 0) {
    return { ok: false, error: lastError ?? "The AI couldn't write questions from this menu. Try a clearer scan." };
  }

  const { passed, rejected } = partitionQuestions(produced, index);
  const firstPassRejected = rejected.length;
  let repairedOnRetry = 0;
  const final = [...passed];

  const reasonCounts = new Map<string, number>();
  for (const r of rejected) reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);

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
      const retryResults = await mapWithConcurrency(retryBatches, BATCH_CONCURRENCY, (b) =>
        generateBatchWithRetry(
          lovableKey,
          b,
          items,
          restaurantName,
          `Your previous attempts at these items were REJECTED by an automated validator. Write clean replacements that fix the stated problems:\n${listing}`,
        ),
      );
      const retried = retryResults.flatMap((r) => (r.ok ? r.questions.map((q) => retagFromRecord(q, byName)) : []));
      const { passed: retryPassed, rejected: retryRejected } = partitionQuestions(retried, index);
      for (const r of retryRejected) reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
      // A retry question only "repairs" a first-pass failure; extra passes beyond
      // the number of failures are still net-new questions in the bank.
      repairedOnRetry = Math.min(retryPassed.length, firstPassRejected);
      final.push(...retryPassed);
    }
  }

  // Questions ultimately discarded by quality checks (failures that were never repaired).
  const rejectedCount = firstPassRejected - repairedOnRetry;
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.info("[menu-quiz] top rejection reasons", topReasons.map(([reason, count]) => `${count}x ${reason}`));


  if (final.length === 0) {
    return { ok: false, error: "Every generated question failed quality checks. Try a clearer menu scan and regenerate." };
  }

  const conflictPass = dropConflictingStemQuestions(final);
  if (conflictPass.droppedCount > 0) {
    console.warn("[menu-quiz] dropped questions with conflicting answers for the same stem", {
      droppedCount: conflictPass.droppedCount,
      conflictingStems: conflictPass.conflictingStems,
    });
  }
  if (conflictPass.questions.length === 0) {
    return { ok: false, error: "Every generated question failed quality checks. Try a clearer menu scan and regenerate." };
  }
  const capPass = capSectionQuestions(shuffled(conflictPass.questions), index);
  const bank = capPass.questions.slice(0, MAX_BANK_QUESTIONS);
  const droppedBySectionCap = conflictPass.questions.length - bank.length;
  const cappedSections = Object.entries(capPass.cappedBySection);
  if (cappedSections.length > 0) {
    console.info(
      "[menu-quiz] section-cap removals",
      cappedSections.map(([section, count]) => `${count}x ${section}`),
    );
  }
  const diagnostics = {
    itemsExtracted: items.length,
    candidatesSelected: candidates.length,
    questionsReturned: produced.length,
    rejectedByQuality: rejectedCount,
    repairedOnRetry,
    generalKnowledgeQuestions: bank.filter((q) => q.factSource === "general_beverage_knowledge").length,
    droppedAsConflicting: conflictPass.droppedCount,
    droppedBySectionCap,
    lostToFailedBatches,
    finalBankSize: bank.length,
    topRejectionReasons: topReasons.map(([reason, count]) => ({
      reason: reason.slice(0, 200),
      count,
    })),
  };
  const expected =
    diagnostics.questionsReturned -
    diagnostics.rejectedByQuality -
    diagnostics.droppedAsConflicting -
    diagnostics.droppedBySectionCap -
    diagnostics.lostToFailedBatches;
  if (expected !== diagnostics.finalBankSize) {
    console.warn("[menu-quiz] diagnostics identity does not hold", { expected, ...diagnostics });
  }

  console.info("[menu-quiz] generation diagnostics", diagnostics);


  return {
    ok: true,
    questions: bank,
    foodCount: bank.filter((q) => q.source === "food").length,
    drinkCount: bank.filter((q) => q.source === "drink").length,
    dessertCount: bank.filter((q) => q.source === "dessert").length,
    rejectedCount,
    diagnostics,
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
  const parsed = z.array(questionSchema).min(1).max(150).safeParse(questionsIn);
  if (!parsed.success) return { ok: false, error: "Those questions are malformed. Regenerate the draft." };

  const questions = parsed.data.map((q) => ({
    question: q.question.slice(0, 240),
    options: q.options.slice(0, 4).map((o) => o.slice(0, 140)),
    answerIndex: Math.max(0, Math.min(3, q.answerIndex)),
    source: q.source,
    sourceItem: (q.sourceItem ?? "").slice(0, 160),
    sourceCategory: (q.sourceCategory ?? "").slice(0, 120),
    questionType: q.questionType ?? "identify_item",
    factSource: q.factSource ?? "menu",
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
