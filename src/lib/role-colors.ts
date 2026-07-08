import type { Role, CustomRole } from "@/lib/sidework-store";

export const ROLE_COLORS: Record<string, string> = {
  // FOH
  Host: "#9B59B6",
  "Server Assistant": "#BDC3E0",
  Busser: "#1ABC9C",
  "Bar Back": "#3498DB",
  Bartender: "#2980B9",
  Server: "#27AE60",
  Manager: "#F39C12",
  "Assistant Manager": "#F1C40F",
  // BOH
  Chef: "#922B21",
  "Sous Chef": "#E74C3C",
  Saute: "#E67E22",
  Grill: "#D35400",
  "Line Cook": "#F39C12",
  "Fry Cook": "#A04000",
  Pizza: "#C0392B",
  "Garde Manger": "#7D6608",
  Prep: "#1E8449",
  Dishwasher: "#7F8C8D",
};

export const FOH_ROLES_ORDERED: Role[] = [
  "Host",
  "Server Assistant",
  "Busser",
  "Bar Back",
  "Bartender",
  "Server",
  "Manager",
  "Assistant Manager",
];

export const BOH_ROLES_ORDERED: Role[] = [
  "Chef",
  "Sous Chef",
  "Saute",
  "Grill",
  "Line Cook",
  "Fry Cook",
  "Pizza",
  "Garde Manger",
  "Prep",
  "Dishwasher",
];

export const ROLES_ORDERED: Role[] = [...FOH_ROLES_ORDERED, ...BOH_ROLES_ORDERED];

export const STATUS_COLORS = {
  timeOff: "#FADBD8",
  ptoPending: "#FDEBD0",
};

// Determine readable text color (black or white) for a given hex background.
export function contrastText(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Relative luminance
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.6 ? "#1a1a1a" : "#ffffff";
}

export function roleStyle(role: Role): React.CSSProperties {
  const bg = ROLE_COLORS[role] ?? "#7F8C8D";
  return {
    backgroundColor: bg,
    color: contrastText(bg),
    borderColor: bg,
  };
}

export function roleSwatch(role: Role): React.CSSProperties {
  return { backgroundColor: ROLE_COLORS[role] ?? "#7F8C8D" };
}
