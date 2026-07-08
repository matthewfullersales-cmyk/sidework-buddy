/**
 * Live phone-number formatter: (XXX) XXX-XXXX
 * Strips non-digits, caps at 10 digits, reformats progressively.
 */
export function formatPhone(input: string): string {
  const digits = (input ?? "").replace(/\D/g, "").slice(0, 10);
  if (digits.length === 0) return "";
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
