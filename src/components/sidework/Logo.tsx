import icon from "@/assets/logo-icon.png";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={icon}
        alt="86Paper"
        className="h-8 w-auto object-contain"
        loading="eager"
        width={512}
        height={512}
      />
      <span className="text-lg font-semibold tracking-tight text-primary">
        86Paper
      </span>
    </div>
  );
}
