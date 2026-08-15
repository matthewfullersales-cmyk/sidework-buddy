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

/** Returns null when the question passes, or a human-readable reason. */
export function rejectionReason(q: ValidatableQuestion): string | null {
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
