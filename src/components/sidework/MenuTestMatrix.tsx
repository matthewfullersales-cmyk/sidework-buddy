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

  const warningFor = (role: Role) => warnings.find((w) => w.role === role);

  return (
    <div className="space-y-3">
      {warnings.length > 0 && (
        <div className="flex gap-2 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            {warnings.map((w) => (
              <p key={w.role}>
                <b>{w.role}s</b> are set to be tested on the{" "}
                {w.missing.map((k) => MENU_KIND_LABEL[k]).join(" and ")} menu, but no{" "}
                {w.missing.map((k) => MENU_KIND_LABEL[k].toLowerCase()).join(" or ")} menu has been uploaded.
                {w.blocked ? " Until you upload it or change this role's test requirements, these employees can't be scheduled." : ""}
              </p>
            ))}
          </div>
        </div>
      )}
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
              const warn = warningFor(role);
              return (
                <tr key={role} className="border-t border-border">
                  <td className="px-3 py-2">
                    <span className="font-medium">{role}</span>
                    {kinds.length === 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">no test required</span>
                    )}
                    {warn && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="h-3 w-3" />
                        needs {warn.missing.map((k) => MENU_KIND_LABEL[k].toLowerCase()).join(" + ")} menu
                      </span>
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
    </div>
  );

}
