import wordmark from "@/assets/logo-wordmark.png";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <img
      src={wordmark}
      alt="86Paper"
      className={`h-10 w-auto object-contain ${className}`}
      loading="eager"
    />
  );
}
