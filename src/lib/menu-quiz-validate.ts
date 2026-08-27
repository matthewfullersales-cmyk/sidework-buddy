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
  "item", "menu", "this", "thi", "that", "these", "those", "guest", "order",
  "orders", "asking", "ask", "they", "them", "their", "you", "your",
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
  // Non-grape wine designations that menus ask about the same way.
  "super tuscan", "chianti classico", "barolo", "barbaresco", "brunello",
  "valpolicella", "amarone", "rioja", "bordeaux", "burgundy", "port",
  "sancerre", "chablis", "soave",
]);


const BEER_STYLES = new Set([
  "lager", "light lager", "pilsner", "ipa", "india pale ale", "pale ale",
  "stout", "porter", "wheat", "wheat beer", "hefeweizen", "amber ale",
  "amber", "sour", "saison", "blonde ale", "blonde", "cider", "brown ale",
  "double ipa", "hazy ipa", "kolsch", "bock",
]);

/**
 * Alcohol-content designations. "N/A" on a beer list means NON-ALCOHOLIC — a
 * real, testable product fact — but it is NOT a beer style, so it must never
 * be mixed into a set of style options.
 */
const ALCOHOL_CONTENT = new Set([
  "n a", "na", "nonalcoholic", "non alcoholic", "alcohol free", "alcoholfree",
  "zero proof", "zeroproof", "booze free", "boozefree", "no alcohol",
]);

const ATTRIBUTE_VALUES = {
  wine_color: WINE_COLORS,
  varietal: VARIETALS,
  beer_style: BEER_STYLES,
} as const;

export type OptionKind =
  | "item" | "section" | "wine_color" | "varietal" | "beer_style"
  | "alcohol_content" | "ingredient" | "other";

export function classifyOption(option: string, index?: ProvenanceIndex): OptionKind {
  const n = normalizeText(option);
  if (!n) return "other";
  // A printed menu item wins: an item literally named "Beck's N/A" is an item.
  if (index?.vocabByItem.has(n)) return "item";
  if (ALCOHOL_CONTENT.has(n)) return "alcohol_content";
  if (WINE_COLORS.has(n)) return "wine_color";
  if (VARIETALS.has(n)) return "varietal";
  if (BEER_STYLES.has(n)) return "beer_style";
  if (index) {
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
  description?: string;
  menuType?: string;
};

export type ProvenanceIndex = {
  /** normalized item name -> the item's own vocabulary of significant tokens */
  vocabByItem: Map<string, Set<string>>;
  /** significant ingredient token -> normalized names of items that print it */
  ownersByToken: Map<string, Set<string>>;
  /** normalized item name -> printed name */
  labelByItem: Map<string, string>;
  /** normalized printed section names */
  sectionKeys: Set<string>;
  /** every significant token that appears in any printed section heading */
  sectionTokens: Set<string>;
  /** normalized item name -> normalized section */
  sectionByItem: Map<string, string>;
  /** normalized item name -> menu type */
  menuTypeByItem: Map<string, string>;
  /** normalized item name -> its own printed ingredient strings */
  ingredientsByItem: Map<string, string[]>;
  /** normalized item name -> normalized preparation + description text */
  recordTextByItem: Map<string, string>;
};


/**
 * Words a stem may use to frame a question without them being claims about the
 * item. Anything outside this list must come from the item's own record.
 */
const FRAME_WORDS = new Set([
  "which", "what", "who", "how", "where", "one", "following", "these", "those",
  "list", "listed", "print", "printed", "guest", "server", "order", "ordered",
  "offer", "offered", "feature", "featured", "come", "made", "make", "prepared",
  "prepare", "topped", "top", "finished", "finish", "built", "poured", "pour",
  "section", "category", "course", "menu", "item", "dish", "drink", "food",
  "dessert", "beverage", "option", "choice", "kind", "type", "style", "brand",
  "varietal", "grape", "producer", "winery", "label", "bottle", "bottled",
  "draft", "draught", "glass", "wine", "beer", "cocktail", "appear", "appears",
  "belong", "belongs", "from", "also", "only", "other", "another", "does",
  "have", "has", "hold", "call", "called", "name", "named", "answer",
]);

function itemVocabulary(item: ProvenanceItem): string[] {
  return [
    ...significantTokens(item.name),
    ...significantTokens(item.section ?? ""),
    ...significantTokens(item.preparation ?? ""),
    ...significantTokens(item.description ?? ""),
    ...(item.ingredients ?? []).flatMap((i) => significantTokens(i)),
  ];
}

/** Build the lookup used by the ingredient-provenance check. */
export function buildProvenanceIndex(items: ProvenanceItem[]): ProvenanceIndex {
  const vocabByItem = new Map<string, Set<string>>();
  const ownersByToken = new Map<string, Set<string>>();
  const labelByItem = new Map<string, string>();
  const sectionKeys = new Set<string>();
  const sectionTokens = new Set<string>();
  const sectionByItem = new Map<string, string>();
  const menuTypeByItem = new Map<string, string>();
  const ingredientsByItem = new Map<string, string[]>();
  const recordTextByItem = new Map<string, string>();

  for (const item of items) {
    const key = normalizeText(item.name);
    if (!key) continue;
    labelByItem.set(key, item.name);
    const vocab = vocabByItem.get(key) ?? new Set<string>();
    for (const t of itemVocabulary(item)) vocab.add(t);
    vocabByItem.set(key, vocab);

    const sec = normalizeText(item.section ?? "");
    sectionByItem.set(key, sec);
    if (sec) {
      sectionKeys.add(sec);
      for (const t of significantTokens(item.section ?? "")) sectionTokens.add(t);
    }
    if (item.menuType) menuTypeByItem.set(key, item.menuType);

    const priorIngredients = ingredientsByItem.get(key) ?? [];
    ingredientsByItem.set(key, [...priorIngredients, ...(item.ingredients ?? [])]);
    const priorText = recordTextByItem.get(key) ?? "";
    recordTextByItem.set(
      key,
      `${priorText} ${normalizeText(`${item.preparation ?? ""} ${item.description ?? ""}`)}`.trim(),
    );

    for (const ing of item.ingredients ?? []) {
      for (const t of significantTokens(ing)) {
        const owners = ownersByToken.get(t) ?? new Set<string>();
        owners.add(key);
        ownersByToken.set(t, owners);
      }
    }
  }
  return {
    vocabByItem,
    ownersByToken,
    labelByItem,
    sectionKeys,
    sectionTokens,
    sectionByItem,
    menuTypeByItem,
    ingredientsByItem,
    recordTextByItem,
  };
}


/**
 * Provenance: EVERY descriptive term in the stem must appear in the question's
 * own source item record (name, section, ingredients, preparation). Terms that
 * belong to a different item are ingredient bleed; terms that appear nowhere in
 * the record are invented outside knowledge. Both are rejected.
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
    if (nearMatchIn(token, ownVocab)) continue;
    if (FRAME_WORDS.has(token)) continue;
    const owners = index.ownersByToken.get(token);
    const other = owners ? [...owners].find((o) => o !== itemKey) : undefined;
    if (other) {
      const label = index.labelByItem.get(other) ?? other;
      return `The stem cites "${token}", which the menu prints for "${label}", not for "${q.sourceItem}".`;
    }
    return `The stem uses "${token}", which the menu never prints for "${q.sourceItem}". Only use words from that item's own printed record.`;
  }
  return null;
}

/**
 * An identify_item stem whose ONLY qualifier is the item's section or menu type
 * is unanswerable (every same-section distractor also satisfies it) or trivially
 * guessable (distractors from other sections give it away).
 */
function discriminatingTokens(q: ValidatableQuestion, index: ProvenanceIndex): string[] {
  const itemKey = normalizeText(q.sourceItem ?? "");
  const menuType = index.menuTypeByItem.get(itemKey) ?? "";
  return [...new Set(significantTokens(q.question))].filter(
    (t) => !FRAME_WORDS.has(t) && !index.sectionTokens.has(t) && t !== menuType,
  );
}

/**
 * An identify_item question is ambiguous when a distractor is itself a menu item
 * whose own vocabulary satisfies every discriminating token in the stem.
 */
function ambiguityRejection(q: ValidatableQuestion, index: ProvenanceIndex): string | null {
  const disc = discriminatingTokens(q, index);
  if (disc.length === 0) return null;
  for (let i = 0; i < q.options.length; i++) {
    if (i === q.answerIndex) continue;
    const vocab = index.vocabByItem.get(normalizeText(q.options[i] ?? ""));
    if (!vocab) continue;
    if (disc.every((t) => nearMatchIn(t, vocab))) {
      return `Ambiguous: "${q.options[i]}" also satisfies this stem, so the question has more than one correct answer.`;
    }
  }
  return null;
}

type AmbiguousAttributeKind = keyof typeof ATTRIBUTE_VALUES;

function attributeValuesIn(text: string, kind: AmbiguousAttributeKind): string[] {
  const normalized = normalizeText(text);
  const matches = [...ATTRIBUTE_VALUES[kind]]
    .filter((value) => ` ${normalized} `.includes(` ${value} `))
    .sort((a, b) => b.length - a.length);
  return matches.filter(
    (value, index) => !matches.slice(0, index).some((longer) => ` ${longer} `.includes(` ${value} `)),
  );
}

function subjectLabel(q: ValidatableQuestion, answer: string): string {
  const answerWords = new Set(words(answer).map(singularize));
  const subjectWords = words(q.question).filter((word) => {
    const token = singularize(word);
    return !STOP_WORDS.has(word) && !FRAME_WORDS.has(token) && !answerWords.has(token);
  });
  return subjectWords
    .map((word) => (word.length <= 2 ? word : `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`))
    .join(" ");
}

/** Reject producer/brand questions when that subject maps to multiple attributes. */
function attributeAmbiguityRejection(q: ValidatableQuestion, index: ProvenanceIndex): string | null {
  const answer = q.options[q.answerIndex] ?? "";
  const kind = classifyOption(answer, index);
  if (kind !== "varietal" && kind !== "beer_style" && kind !== "wine_color") return null;

  const answerTokens = significantTokens(answer);
  const subjectTokens = [...new Set(significantTokens(q.question))].filter(
    (token) =>
      !FRAME_WORDS.has(token) &&
      !index.sectionTokens.has(token) &&
      !answerTokens.some((answerToken) => nearMatch(token, answerToken)),
  );
  if (subjectTokens.length < 1) return null;

  // Fail safe: when the subject names 2+ distinct menu items, every one of
  // them must resolve to the SAME attribute value. An item that resolves to no
  // recognized value is NOT evidence of safety — it is an unresolved answer.
  const matched: { label: string; values: string[] }[] = [];
  for (const [itemName, printedName] of index.labelByItem) {
    const nameTokens = significantTokens(itemName);
    if (!subjectTokens.every((subject) => nameTokens.some((nameToken) => nearMatch(subject, nameToken)))) continue;
    const section = index.sectionByItem.get(itemName) ?? "";
    matched.push({ label: printedName, values: attributeValuesIn(`${itemName} ${section}`, kind) });
  }
  if (matched.length < 2) return null;

  const label = subjectLabel(q, answer) || q.sourceItem || "This subject";
  const resolved = new Set<string>();
  let unresolved = false;
  for (const m of matched) {
    if (m.values.length === 0) unresolved = true;
    for (const value of m.values) resolved.add(normalizeText(value));
  }
  if (resolved.size <= 1 && !unresolved) return null;

  if (unresolved && resolved.size <= 1) {
    return `Ambiguous: "${label}" appears on this menu on ${matched.length} different items (${matched
      .map((m) => m.label)
      .join(", ")}), and their values cannot be resolved to a single answer.`;
  }

  const printedValues = [...resolved].map((value) =>
    value.replace(/\b\w/g, (letter) => letter.toUpperCase()),
  );
  const last = printedValues.pop() ?? "";
  const joined = printedValues.length === 1
    ? `${printedValues[0]}" and "${last}`
    : `${printedValues.join('", "')}" and "${last}`;
  return `Ambiguous: "${label}" appears on this menu as both "${joined}", so this question has more than one correct answer.`;
}


/**
 * A distractor that is itself an ingredient of the SAME dish is equally correct.
 * Only applies when the correct answer is an ingredient.
 */
export function intraItemIngredientAmbiguityRejection(
  q: ValidatableQuestion,
  index: ProvenanceIndex,
): string | null {
  const answer = q.options[q.answerIndex] ?? "";
  if (classifyOption(answer, index) !== "ingredient") return null;

  const itemKey = normalizeText(q.sourceItem ?? "");
  if (!itemKey) return null;
  const ownIngredients = (index.ingredientsByItem.get(itemKey) ?? []).map((i) => normalizeText(i));
  const ownText = index.recordTextByItem.get(itemKey) ?? "";
  if (ownIngredients.length === 0 && !ownText) return null;

  const offenders: string[] = [];
  for (let i = 0; i < q.options.length; i++) {
    if (i === q.answerIndex) continue;
    const option = q.options[i] ?? "";
    const norm = normalizeText(option);
    if (!norm) continue;
    const tokens = significantTokens(option);
    const matchesIngredient = ownIngredients.some(
      (ing) => nearMatch(ing, norm) || (tokens.length > 0 && tokens.every((t) => nearMatchIn(t, significantTokens(ing)))),
    );
    const inText = ownText ? tokens.length > 0 && tokens.every((t) => nearMatchIn(t, significantTokens(ownText))) : false;
    if (matchesIngredient || inText) offenders.push(option);
  }
  if (offenders.length === 0) return null;

  const last = offenders.pop() ?? "";
  const joined = offenders.length === 0 ? `"${last}"` : `"${offenders.join('", "')}" and "${last}"`;
  const verb = offenders.length === 0 ? "is also an ingredient" : "are also ingredients";
  return `Ambiguous: ${joined} ${verb} of this dish, so this question has more than one correct answer.`;
}

/** Is the correct answer derivable from the source item's own printed record? */
export function answerDerivableFromItem(
  answer: string,
  itemKey: string,
  index: ProvenanceIndex,
): boolean {
  const vocab = index.vocabByItem.get(itemKey);
  if (!vocab) return false;
  const tokens = significantTokens(answer);
  if (tokens.length > 0) return tokens.every((t) => nearMatchIn(t, vocab));
  const norm = normalizeText(answer);
  if (!norm) return false;
  const haystack = ` ${itemKey} ${index.sectionByItem.get(itemKey) ?? ""} ${
    index.recordTextByItem.get(itemKey) ?? ""
  } ${(index.ingredientsByItem.get(itemKey) ?? []).map((i) => normalizeText(i)).join(" ")} `;
  return haystack.includes(` ${norm} `);
}

/**
 * Menu-only provenance enforcement.
 *
 * Every question — food, drink, or dessert — must be answerable from the item's
 * own printed record. General knowledge is never allowed.
 */
export function factSourceRejection(
  q: ValidatableQuestion,
  index: ProvenanceIndex,
): string | null {
  const itemKey = normalizeText(q.sourceItem ?? "");
  if (!itemKey) return null;
  if (!index.vocabByItem.has(itemKey)) return null;
  const answer = q.options[q.answerIndex] ?? "";

  if (!answerDerivableFromItem(answer, itemKey, index)) {
    return `The correct answer "${answer}" is nowhere in the printed record for "${q.sourceItem}". Every question must be answerable from what the menu prints.`;
  }
  return null;
}

function sectionOnlyRejection(q: ValidatableQuestion, index: ProvenanceIndex): string | null {

  const itemKey = normalizeText(q.sourceItem ?? "");
  const ownVocab = index.vocabByItem.get(itemKey);
  if (!ownVocab) return null;
  const specific = discriminatingTokens(q, index).filter((t) => nearMatchIn(t, ownVocab));
  if (specific.length === 0) {
    return "The stem only qualifies the item by its section or menu type, so the answer is either ambiguous or guessable without menu knowledge. Ask about an ingredient, preparation, or accompaniment instead.";
  }
  return null;
}

/** Distractors must be the same KIND of thing as the correct answer. */
function optionKindRejection(q: ValidatableQuestion, index?: ProvenanceIndex): string | null {
  const answerKind = classifyOption(q.options[q.answerIndex] ?? "", index);
  if (answerKind === "other") {
    // A vague/unclassifiable answer sitting among options that clearly share a
    // specific kind (e.g. "N/A" among three beer styles) is a mixed-kind set.
    const counts = new Map<OptionKind, number>();
    for (let i = 0; i < q.options.length; i++) {
      if (i === q.answerIndex) continue;
      const kind = classifyOption(q.options[i], index);
      if (kind === "other") continue;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    for (const [kind, n] of counts) {
      if (n >= 2) {
        return `Answer choices mix kinds: "${q.options[q.answerIndex]}" is not a ${kind.replace("_", " ")} but the other choices are. All four choices must be the same kind.`;
      }
    }
    return null;
  }
  for (let i = 0; i < q.options.length; i++) {
    if (i === q.answerIndex) continue;
    const kind = classifyOption(q.options[i], index);
    if (kind === "other") continue;
    if (kind !== answerKind) {
      return `Answer choices mix kinds: the correct answer is a ${answerKind.replace("_", " ")} but "${q.options[i]}" is a ${kind.replace("_", " ")}. All four choices must be the same kind.`;
    }
  }
  return null;
}

/**
 * Tokens belonging to the leading possessive ("vanity") part of an item name —
 * "BOB & LOUANN'S HOMEMADE TIRAMISU" -> ["bob", "louann"]. Empty when the name
 * has no leading possessive.
 */
export function vanityPrefixTokens(itemName: string): string[] {
  const raw = itemName.trim();
  if (!raw) return [];
  const parts = raw.split(/\s+/);
  const end = parts.findIndex((w) => /['\u2019]s[.,]?$/i.test(w) || /s['\u2019][.,]?$/i.test(w));
  if (end < 0 || end > 4) return [];
  return significantTokens(parts.slice(0, end + 1).join(" "));
}

/**
 * Narrow exemption to the stem/answer overlap check: an overlapping token is
 * NOT a leak when it only appears in the stem as part of a multi-word
 * ingredient phrase printed in that question's own source item record.
 */
function multiWordIngredientExempt(
  token: string,
  q: ValidatableQuestion,
  answerTokens: string[],
  index?: ProvenanceIndex,
): boolean {
  if (!index) return false;
  const itemKey = normalizeText(q.sourceItem ?? "");
  if (!itemKey) return false;
  const ownText = index.recordTextByItem.get(itemKey) ?? "";
  const phrases = (index.ingredientsByItem.get(itemKey) ?? [])
    .map((i) => normalizeText(i))
    .filter((p) => p.split(" ").filter(Boolean).length >= 2);
  if (phrases.length === 0) return false;

  const stemNorm = ` ${normalizeText(q.question)} `;
  for (const phrase of phrases) {
    // (i) phrase is printed for this item and appears verbatim in the stem
    if (!stemNorm.includes(` ${phrase} `)) continue;
    const printed =
      (index.ingredientsByItem.get(itemKey) ?? []).some((i) => normalizeText(i) === phrase) ||
      ` ${ownText} `.includes(` ${phrase} `);
    if (!printed) continue;
    const phraseTokens = significantTokens(phrase);
    if (!phraseTokens.some((p) => nearMatch(p, token))) continue;

    // (ii) the token must not also stand alone outside the phrase
    const stripped = stemNorm.split(` ${phrase} `).join(" ");
    const strippedTokens = significantTokens(stripped);
    if (strippedTokens.some((s) => nearMatch(s, token))) continue;

    // (iii) the answer must still hold something the phrase does not contain
    const extra = answerTokens.some((a) => !phraseTokens.some((p) => nearMatch(p, a)));
    if (!extra) continue;

    return true;
  }
  return false;
}

/** Returns null when the question passes, or a human-readable reason. */

export function rejectionReason(
  q: ValidatableQuestion,
  index?: ProvenanceIndex,
): string | null {
  const answer = q.options[q.answerIndex] ?? "";
  if (!answer.trim()) return "The correct answer is empty.";



  // Whole-string check: short answers ("N/A", "IPA") produce no significant
  // tokens, so the token overlap check below would silently pass them.
  const answerNorm = normalizeText(answer);
  if (answerNorm && ` ${normalizeText(q.question)} `.includes(` ${answerNorm} `)) {
    return `The stem contains the correct answer verbatim ("${answer}"). Strip the answer out of the stem, or ask about a different attribute of the item.`;
  }

  // Vanity-name allowance: menus that name dishes after people ("BOB & LOUANN'S
  // HOMEMADE TIRAMISU") support a legitimate question — "which dessert is 'Bob &
  // LouAnn's'?" — whose stem must quote the proprietary part of the answer.
  // Those tokens are exempt from the self-answering checks; every other token is
  // still enforced exactly as before.
  const vanityTokens = new Set(vanityPrefixTokens(q.sourceItem ?? ""));

  const stemTokens = [...new Set(significantTokens(q.question))];
  const answerTokens = significantTokens(answer);
  const rawOverlap = answerTokens.filter(
    (t) => !vanityTokens.has(t) && stemTokens.some((s) => nearMatch(s, t)),
  );
  const overlap = rawOverlap.filter(
    (t) => !multiWordIngredientExempt(t, q, answerTokens, index),
  );
  if (overlap.length > 0) {
    return `The stem repeats (or near-repeats) word(s) from the correct answer: ${[...new Set(overlap)].join(", ")}. Strip the answer term out of the stem, or ask about a different attribute of the item.`;
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
      const a = itemWords[i];
      const b = itemWords[i + 1];
      if (vanityTokens.has(a) && vanityTokens.has(b)) continue;
      const pair = `${a} ${b}`;
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

  // No euphemistic filler standing in for a real word.
  const filler = ["component", "element", "option", "ingredient thing", "product"];
  const stemNorm = ` ${normalizeText(q.question)} `;
  for (const f of filler) {
    if (stemNorm.includes(` ${f} `) || stemNorm.includes(` ${f}s `)) {
      return `The stem uses vague filler ("${f}"). Write it the way a server would actually say it, or ask about a different detail.`;
    }
  }

  const kindIssue = optionKindRejection(q, index);
  if (kindIssue) return kindIssue;

  if (index) {
    const prov = provenanceRejection(q, index);
    if (prov) return prov;
    const attributeAmbiguity = attributeAmbiguityRejection(q, index);
    if (attributeAmbiguity) return attributeAmbiguity;
    const intraItem = intraItemIngredientAmbiguityRejection(q, index);
    if (intraItem) return intraItem;
    const factIssue = factSourceRejection(q, index);
    if (factIssue) return factIssue;

    // Don't trust the model's self-declared question_type: derive the effective
    // type from the shape of the correct answer. If the answer is a known menu
    // item name, this is an identify_item question no matter what it claims.
    const answerIsItem = classifyOption(answer, index) === "item";
    if (answerIsItem || q.questionType !== "identify_attribute") {
      const secOnly = sectionOnlyRejection(q, index);
      if (secOnly) return secOnly;
      const ambiguous = ambiguityRejection(q, index);
      if (ambiguous) return ambiguous;
    }
  }

  return null;
}

/** True when the correct answer is a printed section name (a "which section" question). */
export function isSectionQuestion(q: ValidatableQuestion, index: ProvenanceIndex): boolean {
  return index.sectionKeys.has(normalizeText(q.options[q.answerIndex] ?? ""));
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
