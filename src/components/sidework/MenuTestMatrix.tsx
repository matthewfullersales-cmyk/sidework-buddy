import { AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  MENU_KIND_LABEL,
  defaultMenuKindsForRole,
  menuTestConfigWarnings,
  type CustomRole,
  type MenuKind,
  type MenuTestConfig,
  type Role,
} from "@/lib/sidework-store";

/**
 * Per-role / per-menu-type requirement grid. Rows = the roles the restaurant
 * staffs, columns = ONLY the menu types that actually exist. A row with zero
 * boxes checked means that role is never gated by the Menu Knowledge Test.
 *
 * If a role is configured to require a menu type the restaurant hasn't
 * uploaded, that role fails CLOSED (blocked from the schedule) and the owner
 * is warned here, at the point of configuration.
 */
export function MenuTestMatrix({
  roles,
  menuKinds,
  value,
  onChange,
  customRoles = [],
}: {
  roles: Role[];
  menuKinds: MenuKind[];
  value: MenuTestConfig;
  onChange: (next: MenuTestConfig) => void;
  customRoles?: CustomRole[];
}) {
  const warnings = menuTestConfigWarnings(roles, menuKinds, value, customRoles);

  if (roles.length === 0) {
    return <p className="text-sm text-muted-foreground">Pick your roles first — they'll show up here.</p>;
  }
  if (menuKinds.length === 0) {
    return <p className="text-sm text-muted-foreground">Upload at least one menu to configure menu tests.</p>;
  }

  const kindsFor = (role: Role): MenuKind[] =>
    Object.prototype.hasOwnProperty.call(value, role)
      ? value[role]
      : defaultMenuKindsForRole(role, menuKinds, customRoles);

  const toggle = (role: Role, kind: MenuKind, on: boolean) => {
    const current = kindsFor(role);
    const next = on ? Array.from(new Set([...current, kind])) : current.filter((k) => k !== kind);
    onChange({ ...value, [role]: next });
  };


  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Role</th>
            {menuKinds.map((k) => (
              <th key={k} className="px-3 py-2 text-center font-semibold">
                {MENU_KIND_LABEL[k]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => {
            const kinds = kindsFor(role);
            return (
              <tr key={role} className="border-t border-border">
                <td className="px-3 py-2">
                  <span className="font-medium">{role}</span>
                  {kinds.length === 0 && (
                    <span className="ml-2 text-xs text-muted-foreground">no test required</span>
                  )}
                </td>
                {menuKinds.map((k) => (
                  <td key={k} className="px-3 py-2 text-center">
                    <Checkbox
                      aria-label={`${role} must pass the ${MENU_KIND_LABEL[k]} menu test`}
                      checked={kinds.includes(k)}
                      onCheckedChange={(c) => toggle(role, k, c === true)}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
