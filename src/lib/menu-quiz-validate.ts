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

export type ValidatableQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  sourceItem?: string;
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
  if (item) {
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

  return null;
}

export function partitionQuestions<T extends ValidatableQuestion>(
  questions: T[],
): { passed: T[]; rejected: { question: T; reason: string }[] } {
  const passed: T[] = [];
  const rejected: { question: T; reason: string }[] = [];
  for (const q of questions) {
    const reason = rejectionReason(q);
    if (reason) rejected.push({ question: q, reason });
    else passed.push(q);
  }
  return { passed, rejected };
}
