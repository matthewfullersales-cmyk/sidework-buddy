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

// Palette used when auto-assigning a color to a new custom role.
export const CUSTOM_COLOR_PALETTE: string[] = [
  "#8E44AD", "#16A085", "#2C3E50", "#E91E63", "#00ACC1",
  "#FF7043", "#5D4037", "#6D4C41", "#546E7A", "#AD1457",
  "#00897B", "#43A047", "#FB8C00", "#3949AB", "#C2185B",
];

export function nextCustomColor(existing: CustomRole[]): string {
  const used = new Set([
    ...Object.values(ROLE_COLORS).map((c) => c.toLowerCase()),
    ...existing.map((c) => c.color.toLowerCase()),
  ]);
  const free = CUSTOM_COLOR_PALETTE.find((c) => !used.has(c.toLowerCase()));
  return free ?? CUSTOM_COLOR_PALETTE[existing.length % CUSTOM_COLOR_PALETTE.length];
}

export function fohRolesWithCustom(customRoles: CustomRole[]): Role[] {
  return [...FOH_ROLES_ORDERED, ...customRoles.filter((c) => c.section === "FOH").map((c) => c.name)];
}

export function bohRolesWithCustom(customRoles: CustomRole[]): Role[] {
  return [...BOH_ROLES_ORDERED, ...customRoles.filter((c) => c.section === "BOH").map((c) => c.name)];
}

export function allRolesWithCustom(customRoles: CustomRole[]): Role[] {
  return [...fohRolesWithCustom(customRoles), ...bohRolesWithCustom(customRoles)];
}
