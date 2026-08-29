// Initials-only avatar. This product never stores photos of people, so there is
// deliberately no image support here — no src, no photoUrl, no <img> fallback.
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

// Fixed palette built from existing design tokens; each pair is contrast-safe.
const PALETTE = [
  "bg-primary text-primary-foreground",
  "bg-success text-success-foreground",
  "bg-warning text-warning-foreground",
  "bg-destructive text-destructive-foreground",
  "bg-accent text-accent-foreground",
  "bg-secondary text-secondary-foreground",
  "bg-foreground text-background",
  "bg-muted text-foreground",
];

function hashString(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function personInitials(firstName?: string | null, lastName?: string | null): string {
  const f = (firstName ?? "").trim();
  const l = (lastName ?? "").trim();
  const a = f ? f[0]!.toUpperCase() : "";
  const b = l ? l[0]!.toUpperCase() : "";
  const initials = `${a}${b}`;
  return initials || "?";
}

export function PersonAvatar({
  firstName,
  lastName,
  size = "md",
  id,
  className,
}: {
  firstName?: string | null;
  lastName?: string | null;
  size?: Size;
  id?: string;
  className?: string;
}) {
  const seed = (id ?? `${firstName ?? ""} ${lastName ?? ""}`).trim() || "person";
  const tone = PALETTE[hashString(seed) % PALETTE.length]!;
  const initials = personInitials(firstName, lastName);

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-wide",
        SIZE_CLASS[size],
        tone,
        className,
      )}
    >
      {initials}
    </div>
  );
}

export default PersonAvatar;
