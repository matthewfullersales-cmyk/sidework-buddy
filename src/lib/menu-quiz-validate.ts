// Anti-self-answering validator for Menu Knowledge Test questions.
//
// A question is REJECTED when the stem gives the answer away:
//   - any significant token appears in BOTH the stem and the correct answer
//   - the stem contains the source item's name, or two or more consecutive
//     words from it
//
// Pure module (no server imports) so it can be unit-tested and reused.

export const STOP_WORDS = new Set([
  "the", "a", "an", "with", "and", "or", "of", "in", "on", "for", "to", "is",
  "are", "which", "what", "contains", "includes", "served", "side", "dish",
  "item", "menu",
]);

/** lowercase, strip punctuation, collapse whitespace */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/['-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** naive singularization of simple plurals */
export function singularize(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && (word.endsWith("ches") || word.endsWith("shes") || word.endsWith("sses") || word.endsWith("xes"))) {
    return word.slice(0, -2);
  }
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

export function words(input: string): string[] {
  const n = normalizeText(input);
  return n ? n.split(" ") : [];
}

/** significant tokens: non-stop-words, singularized, length > 2 */
export function significantTokens(input: string): string[] {
  return words(input)
    .filter((w) => !STOP_WORDS.has(w) && w.length > 2)
    .map(singularize);
}

/** Levenshtein distance, capped for speed. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 3) return 99;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/**
 * Menus routinely contain typos ("REISLING"), so exact token equality is not
 * enough for the anti-self-answering check.
 */
export function nearMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const long = a.length >= b.length ? a : b;
  const short = a.length >= b.length ? b : a;
  if (short.length >= 5 && long.startsWith(short)) return true;
  const len = Math.min(a.length, b.length);
  if (len >= 6) return editDistance(a, b) <= 2;
  if (len >= 4) return editDistance(a, b) <= 1;
  return false;
}

function nearMatchIn(token: string, pool: Iterable<string>): boolean {
  for (const t of pool) if (nearMatch(token, t)) return true;
  return false;
}

/* -------- option "kind" classification (distractors must match the answer) --- */

const WINE_COLORS = new Set([
  "red", "white", "rose", "rosato", "blush", "sparkling", "orange",
  "red wine", "white wine", "rose wine", "sparkling wine", "dessert wine",
]);

const VARIETALS = new Set([
  "chardonnay", "riesling", "reisling", "moscato", "merlot", "cabernet",
  "cabernet sauvignon", "pinot noir", "pinot grigio", "pinot gris",
  "sauvignon blanc", "malbec", "zinfandel", "prosecco", "syrah", "shiraz",
  "grenache", "sangiovese", "tempranillo", "chianti", "gewurztraminer",
  "viognier", "albarino", "nebbiolo", "barbera", "montepulciano",
  "chenin blanc", "vermentino", "primitivo", "cava", "champagne", "verdejo",
]);

const BEER_STYLES = new Set([
  "lager", "light lager", "pilsner", "ipa", "india pale ale", "pale ale",
  "stout", "porter", "wheat", "wheat beer", "hefeweizen", "amber ale",
  "amber", "sour", "saison", "blonde ale", "blonde", "cider", "brown ale",
  "double ipa", "hazy ipa", "kolsch", "bock",
]);

export type OptionKind =
  | "item" | "section" | "wine_color" | "varietal" | "beer_style" | "ingredient" | "other";

export function classifyOption(option: string, index?: ProvenanceIndex): OptionKind {
  const n = normalizeText(option);
  if (!n) return "other";
  if (WINE_COLORS.has(n)) return "wine_color";
  if (VARIETALS.has(n)) return "varietal";
  if (BEER_STYLES.has(n)) return "beer_style";
  if (index) {
    if (index.vocabByItem.has(n)) return "item";
    if (index.sectionKeys?.has(n)) return "section";
    const toks = significantTokens(option);
    if (toks.length > 0 && toks.every((t) => index.ownersByToken.has(t))) return "ingredient";
  }
  return "other";
}


export type QuestionType = "identify_item" | "identify_attribute";

export type ValidatableQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  sourceItem?: string;
  /** "identify_attribute" stems are REQUIRED to name the item, so the
   *  item-name-in-stem check is skipped for them. */
  questionType?: QuestionType;
};

export type Rejection = { index: number; reason: string };

/** Minimal shape of an extracted menu item needed for provenance checking. */
export type ProvenanceItem = {
  name: string;
  section?: string;
  ingredients?: string[];
  preparation?: string;
};

export type ProvenanceIndex = {
  /** normalized item name -> the item's own vocabulary of significant tokens */
  vocabByItem: Map<string, Set<string>>;
  /** significant ingredient token -> normalized names of items that print it */
  ownersByToken: Map<string, Set<string>>;
  /** normalized item name -> printed name */
  labelByItem: Map<string, string>;
};

function itemVocabulary(item: ProvenanceItem): string[] {
  return [
    ...significantTokens(item.name),
    ...significantTokens(item.section ?? ""),
    ...significantTokens(item.preparation ?? ""),
    ...(item.ingredients ?? []).flatMap((i) => significantTokens(i)),
  ];
}

/** Build the lookup used by the ingredient-provenance check. */
export function buildProvenanceIndex(items: ProvenanceItem[]): ProvenanceIndex {
  const vocabByItem = new Map<string, Set<string>>();
  const ownersByToken = new Map<string, Set<string>>();
  const labelByItem = new Map<string, string>();

  for (const item of items) {
    const key = normalizeText(item.name);
    if (!key) continue;
    labelByItem.set(key, item.name);
    const vocab = vocabByItem.get(key) ?? new Set<string>();
    for (const t of itemVocabulary(item)) vocab.add(t);
    vocabByItem.set(key, vocab);

    for (const ing of item.ingredients ?? []) {
      for (const t of significantTokens(ing)) {
        const owners = ownersByToken.get(t) ?? new Set<string>();
        owners.add(key);
        ownersByToken.set(t, owners);
      }
    }
  }
  return { vocabByItem, ownersByToken, labelByItem };
}

/**
 * Ingredient provenance: any ingredient term cited in the stem must belong to
 * the question's own source item. A term that only exists in ANOTHER item's
 * printed record is ingredient bleed and gets rejected.
 */
export function provenanceRejection(
  q: ValidatableQuestion,
  index: ProvenanceIndex,
): string | null {
  const itemKey = normalizeText(q.sourceItem ?? "");
  if (!itemKey) return null;
  const ownVocab = index.vocabByItem.get(itemKey);
  if (!ownVocab) {
    return `The question is tagged to "${q.sourceItem}", which is not an item on the extracted menu.`;
  }
  for (const token of new Set(significantTokens(q.question))) {
    if (ownVocab.has(token)) continue;
    const owners = index.ownersByToken.get(token);
    if (!owners || owners.size === 0) continue;
    const other = [...owners].find((o) => o !== itemKey);
    if (other) {
      const label = index.labelByItem.get(other) ?? other;
      return `The stem cites "${token}", which the menu prints for "${label}", not for "${q.sourceItem}".`;
    }
  }
  return null;
}

/** Returns null when the question passes, or a human-readable reason. */
export function rejectionReason(
  q: ValidatableQuestion,
  index?: ProvenanceIndex,
): string | null {
  const answer = q.options[q.answerIndex] ?? "";
  if (!answer.trim()) return "The correct answer is empty.";

  const stemTokens = new Set(significantTokens(q.question));
  const answerTokens = significantTokens(answer);
  const overlap = answerTokens.filter((t) => stemTokens.has(t));
  if (overlap.length > 0) {
    return `The stem repeats word(s) from the correct answer: ${[...new Set(overlap)].join(", ")}. Ask about the item's OTHER components instead.`;
  }

  const item = (q.sourceItem ?? "").trim();
  if (item && q.questionType !== "identify_attribute") {
    const itemWords = words(item).map(singularize).filter((w) => !STOP_WORDS.has(w));
    const stemWordList = words(q.question).map(singularize);
    const stemJoined = ` ${stemWordList.join(" ")} `;
    const itemJoined = itemWords.join(" ");
    if (itemJoined && stemJoined.includes(` ${itemJoined} `)) {
      return `The stem names the menu item it is asking about ("${item}").`;
    }
    for (let i = 0; i + 1 < itemWords.length; i++) {
      const pair = `${itemWords[i]} ${itemWords[i + 1]}`;
      if (stemJoined.includes(` ${pair} `)) {
        return `The stem repeats two consecutive words from the item name ("${pair}").`;
      }
    }
  }

  // Distractor sanity: no "all/none of the above", no duplicate/empty options.
  const banned = ["all of the above", "none of the above"];
  const normOpts = q.options.map((o) => normalizeText(o));
  if (normOpts.some((o) => !o)) return "One of the answer choices is empty.";
  if (new Set(normOpts).size !== normOpts.length) return "Two answer choices are identical.";
  if (normOpts.some((o) => banned.includes(o))) return "Uses an 'all/none of the above' option.";

  if (index) {
    const prov = provenanceRejection(q, index);
    if (prov) return prov;
  }

  return null;
}

export function partitionQuestions<T extends ValidatableQuestion>(
  questions: T[],
  index?: ProvenanceIndex,
): { passed: T[]; rejected: { question: T; reason: string }[] } {
  const passed: T[] = [];
  const rejected: { question: T; reason: string }[] = [];
  for (const q of questions) {
    const reason = rejectionReason(q, index);
    if (reason) rejected.push({ question: q, reason });
    else passed.push(q);
  }
  return { passed, rejected };
}
