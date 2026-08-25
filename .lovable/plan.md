# Fix join-link identity mismatch

## Implementation
- In the `/join/$slug` submit auth-resolution block, normalize the entered and active-session emails with trim + lowercase.
- Reuse the active session only when those normalized emails match.
- When they differ, show a clear confirmation naming both addresses; cancel submission if declined, otherwise sign out before running the existing signup/sign-in fallback for the entered email.
- After signup, require an active returned session before attempting the join claim; if email confirmation is required, show a specific instruction to confirm the email and reopen the join link.

## Scope
- Change only `src/routes/join.$slug.tsx`.
- Preserve pending joins, approval behavior, slug resolution, and the existing database RPC.

## Verification
- Check mismatched-session cancel and continue paths, matching-session reuse, no-session signup/sign-in behavior, and the email-confirmation response.
- Confirm the project build remains clean.
