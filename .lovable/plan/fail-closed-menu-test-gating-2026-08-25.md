# Fail-closed menu test gating

## Implementation
- Add one intrinsic role-requirement helper: exempt roles require none, FOH requires Food/Drink/Dessert, and BOH requires Food/Dessert.
- Preserve explicit per-role configuration, including an explicit empty array as the only owner opt-out.
- Make client blocked/status/eligibility/progress/onboarding calculations compare intrinsic or explicit requirements against the actual question pools.
- Keep the setup/configuration matrix limited to uploaded menu kinds for usability, while ensuring missing defaults are not persisted as accidental opt-outs.
- Align server quiz-start gating with the same intrinsic defaults so absent pools fail closed.
- Ensure the owner overview counts blocked staff and displays a clear upload warning.

## Verification
- Add focused regression checks for a Server with no bank, explicit empty opt-out, Dishwasher exemption, missing role, partial bank availability, and warning deduplication.
- Verify the existing employee blocked card and owner warning paths, then confirm current diagnostics are clean.

## Technical details
- `requiredMenuKindsFor` may continue returning only testable kinds; all eligibility/status callers must check `menuTestBlockedFor` first, so zero available pools cannot imply eligibility.
- No database, join, generation, grading, anti-cheat, billing, or signup changes.
