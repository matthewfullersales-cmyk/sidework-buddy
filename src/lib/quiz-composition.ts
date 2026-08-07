// Question sourcing & composition for the single Menu Knowledge Test.
//
// One test, one pass/fail, one gate. What varies is WHICH pools the questions
// are drawn from — determined by the owner's per-role menu test config —
// and how many come from each (proportional to pool size), interleaved.
//
// Grading, anti-cheat, owner approval and stale-menu retakes live elsewhere
// and are untouched by this module.

export type MenuKind = "food" | "drink" | "dessert";

export type BankQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  source?: MenuKind;
};

export const MENU_KINDS: MenuKind[] = ["food", "drink", "dessert"];

// Duplicates the BOH built-in list from sidework-store so the server can
// resolve role defaults without importing the client store.
const BOH_ROLES = new Set([
  "Chef", "Sous Chef", "Line Cook", "Fry Cook", "Saute", "Grill", "Pizza", "Garde Manger", "Dishwasher", "Prep",
]);

/** Roles that never need menu knowledge by default. */
const MENU_EXEMPT_ROLES = new Set(["Dishwasher"]);

export function isBohRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return BOH_ROLES.has(role.trim());
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickRandom<T>(items: T[], count: number): T[] {
  return shuffle(items).slice(0, count);
}

/** FOH -> every available menu kind; BOH -> food + dessert; Dishwasher -> none. */
export function defaultMenuKindsForRole(role: string, available: MenuKind[]): MenuKind[] {
  if (MENU_EXEMPT_ROLES.has(role.trim())) return [];
  if (isBohRole(role)) return available.filter((k) => k !== "drink");
  return available.slice();
}

export function normalizeMenuTestConfig(raw: unknown): Record<string, MenuKind[]> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, MenuKind[]> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(v)) continue;
    out[k] = v.filter((x): x is MenuKind => x === "food" || x === "drink" || x === "dessert");
  }
  return out;
}

export function poolsByKind(questions: BankQuestion[]): Record<MenuKind, BankQuestion[]> {
  return {
    // Legacy rows with no source tag are food questions.
    food: questions.filter((q) => q.source === "food" || q.source === undefined),
    drink: questions.filter((q) => q.source === "drink"),
    dessert: questions.filter((q) => q.source === "dessert"),
  };
}

/**
 * Menu kinds this employee must be tested on: union of their roles'
 * configured kinds (or the role default when unconfigured), intersected with
 * the kinds the current bank actually has questions for.
 */
export function requiredKindsForRoles(
  roles: string[],
  config: Record<string, MenuKind[]>,
  pools: Record<MenuKind, BankQuestion[]>,
): MenuKind[] {
  const available = MENU_KINDS.filter((k) => pools[k].length > 0);
  if (available.length === 0 || roles.length === 0) return [];
  const set = new Set<MenuKind>();
  for (const role of roles) {
    const kinds = Object.prototype.hasOwnProperty.call(config, role)
      ? config[role]
      : defaultMenuKindsForRole(role, available);
    for (const k of kinds) if (available.includes(k)) set.add(k);
  }
  return MENU_KINDS.filter((k) => set.has(k));
}

/**
 * Draw `size` questions across `kinds`, proportional to each pool's size,
 * with at least one question from every non-empty required pool, then shuffle
 * everything together so categories are interleaved rather than sectioned.
 * If the required pools can't fill the quota, top up from the other pools.
 */
export function composeQuestions(
  pools: Record<MenuKind, BankQuestion[]>,
  kinds: MenuKind[],
  size: number,
): BankQuestion[] {
  const usable = kinds.filter((k) => pools[k].length > 0);
  if (usable.length === 0) return [];

  const total = usable.reduce((sum, k) => sum + pools[k].length, 0);
  // Start with one guaranteed question per required pool.
  const alloc: Record<string, number> = {};
  for (const k of usable) alloc[k] = 1;
  let remaining = Math.max(0, size - usable.length);

  if (remaining > 0) {
    const shares = usable.map((k) => ({
      k,
      exact: (pools[k].length / total) * remaining,
    }));
    for (const s of shares) alloc[s.k] += Math.floor(s.exact);
    let left = remaining - shares.reduce((sum, s) => sum + Math.floor(s.exact), 0);
    // Hand out the rounding remainder to the largest fractional shares.
    const byFraction = [...shares].sort(
      (a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)),
    );
    let i = 0;
    while (left > 0 && byFraction.length > 0) {
      alloc[byFraction[i % byFraction.length].k] += 1;
      left--;
      i++;
    }
  }

  // Cap each allocation at the pool size and draw.
  const picked: BankQuestion[] = [];
  for (const k of usable) {
    picked.push(...pickRandom(pools[k], Math.min(alloc[k], pools[k].length)));
  }

  // Trim if over quota (can happen when usable.length > size).
  let chosen = picked.length > size ? shuffle(picked).slice(0, size) : picked;

  // Top up from anything left over — required pools first, then the rest.
  if (chosen.length < size) {
    const used = new Set(chosen);
    const leftovers = [
      ...usable.flatMap((k) => pools[k]),
      ...MENU_KINDS.filter((k) => !usable.includes(k)).flatMap((k) => pools[k]),
    ].filter((q) => !used.has(q));
    chosen = [...chosen, ...pickRandom(leftovers, size - chosen.length)];
  }

  return shuffle(chosen);
}
