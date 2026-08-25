/**
 * Normalizes a restaurant name into a URL slug.
 * Returns "" when there is nothing usable — callers must never fall back to a
 * shared literal like "team" (that made every restaurant share /join/team).
 */
export function slugify(input: string): string {
  const out = (input ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/^-+|-+$/g, "");
  return out === "team" ? "" : out;
}
