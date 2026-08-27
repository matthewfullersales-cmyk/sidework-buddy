// Client-safe merging of per-file extraction results.
//
// Extraction now runs one menu file at a time, so the results have to be
// combined before question writing. The dedupe rule mirrors the one
// runExtractMenu already applies inside a single file: same item name (case
// insensitive) keeps the record with the most listed ingredients — a wine can
// legitimately appear on both the bottle list and the by-the-glass list.

import type { ExtractedItem, MenuCoverage } from "./menu-quiz.schemas";

export type FileExtraction = {
  filename: string;
  items: ExtractedItem[];
  coverage: MenuCoverage;
};

export function dedupeItems(items: ExtractedItem[]): ExtractedItem[] {
  const byName = new Map<string, ExtractedItem>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || item.ingredients.length > existing.ingredients.length) {
      byName.set(key, item);
    }
  }
  return Array.from(byName.values());
}

export function countByKind(items: ExtractedItem[]) {
  return {
    foodItems: items.filter((i) => i.menuType === "food").length,
    drinkItems: items.filter((i) => i.menuType === "drink").length,
    dessertItems: items.filter((i) => i.menuType === "dessert").length,
  };
}

export function mergeExtractions(results: FileExtraction[]): {
  items: ExtractedItem[];
  coverage: MenuCoverage;
} {
  const items = dedupeItems(results.flatMap((r) => r.items));
  const sections = Array.from(
    new Set(results.flatMap((r) => r.coverage.sections).filter((s) => s.trim().length > 0)),
  );
  const skippedItems = results.reduce((sum, r) => sum + (r.coverage.skippedItems ?? 0), 0);
  return {
    items,
    coverage: { ...countByKind(items), sections, skippedItems },
  };
}
