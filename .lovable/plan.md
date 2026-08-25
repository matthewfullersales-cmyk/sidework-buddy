# Fix the public join link (`/join/$slug`)

Today the join page is pure browser state: a new hire opening the link on their own phone sees "the team", the slug guard can never fail, and the employee they create is written into their own device's local store — never to the owner's roster. The auth user that gets created belongs to no restaurant. This plan makes the whole flow server-resolved and tenant-correct.

## 1. Slugs become real data

Add a `slug` column to the restaurant profile row (`profiles`), unique across all tenants, case-insensitive, and required for any owner account.

- Generated from the restaurant name using the existing normalization rules (lowercase, strip accents/punctuation, hyphenate, trim to 40 chars).
- **Collision strategy:** if the base slug is taken, append `-2`, `-3`, … until free, allocated inside a database function that holds a lock so two simultaneous signups can't grab the same one. Owners can still edit their slug; the same uniqueness check runs and the UI reports "that link is taken" instead of silently keeping the old one (today it silently only updates local state).
- **Empty-name fallback:** never fall back to the shared literal `team`. If a restaurant has no usable name, allocate `restaurant-<short random suffix>`. That is the bug behind every restaurant sharing `/join/team`.
- The owner's Staff Onboarding card reads the slug from the database, not from `slugify(name)` in the browser, so the QR code and printed poster always match reality.

## 2. Public slug resolution

A `SECURITY DEFINER` database function `get_public_join_restaurant(slug)` returns **exactly two values**: `owner_id` and `restaurant_name`. Nothing else — no email, address, phone, subscription status, business info, menu config, employee counts.

The join page becomes server-resolved: a public server function calls that resolver and the page renders the real restaurant name to a signed-out visitor.

### Why this doesn't leak or enable enumeration

- No broad `TO anon` SELECT policy is added to `profiles`. The function is the only public read path, and it projects two columns.
- It only accepts an exact slug match — no prefix, wildcard, or list mode, so it can't be used to walk the tenant list. (The existing `search_restaurants` function is a separate, already-shipped surface and is out of scope here.)
- `owner_id` is a UUID that is already effectively public in invite links; it is needed to attach the new hire and is not sensitive on its own, since every table keyed on it is protected by owner-scoped policies.
- Unknown slug returns zero rows — indistinguishable from any other miss.

## 3. Unrecognized slug renders "Join link not found"

The page has three states instead of today's always-pass guard: resolving, resolved (show the form), not-found (show the existing "Join link not found" screen). The `slugMatches` comparison against local store data is deleted outright.

## 4. Writing the new hire to the right owner

The join submission stops writing to the visitor's local store. Instead, mirroring the working `staff-invite` claim flow:

1. Client validates the form (unchanged zod rules, split First/Last name, `(585) 555-5555` phone formatting kept).
2. Resolve the auth user through the same three paths the invite claim now uses — existing session for that email, else sign up, else sign in if the account already exists — so a half-finished join is resumable rather than bricked.
3. Call a `SECURITY DEFINER` function `join_restaurant_by_slug(slug, auth_user_id, profile_json)` that resolves the slug to `owner_id` server-side and inserts the `restaurant_employees` row with that `owner_id`, `auth_user_id`, name, email, phone, primary role, weekly availability and emergency contact.

Key points: the client never supplies `owner_id` (it can't forge a tenant), the insert is idempotent per `(owner_id, auth_user_id)` so a retry doesn't duplicate the hire, and role/approval columns are set to the safe defaults the invite flow uses — a self-joining employee still cannot grant themselves approved roles.

The new hire then appears on the owner's Team tab through the existing roster query, and the owner gets the existing "just joined" notification.

## 5. Backfill

One-time migration: allocate a slug for every existing owner profile from its restaurant name, resolving collisions with the numeric suffix rule and using the random-suffix fallback for blank names. Verified against current data — 7 owner accounts.

## 6. Auth users orphaned by the broken flow

Current state, measured: 7 employee-role profiles, **6 of which have no `restaurant_employees` row** (5 of them created in one batch with blank names — likely test accounts, one is `Matt Fuller`).

Recommended handling, for your call:

- Do **not** auto-attach them to a restaurant. There is no reliable record of which tenant they meant to join, so any guess risks putting a stranger on someone's roster.
- Leave the auth users in place and let them recover organically: once the join page works, the same person can re-open the correct link, sign in with their existing password (path 2 above handles this), and get attached properly.
- Separately, I can give you a short admin list of orphaned employee accounts so you can delete the obvious test rows. Deleting real users is not something I'd do without you naming them.

## Flagged, not fixed

The join success screen still says "Complete your videos and quizzes before your first shift." There are no videos in this product; that block should point at the Menu Knowledge Test instead. Not touching it in this pass — say the word and I'll fold it in.

## Risks and decisions for you

1. **Should the public join link stay open?** Anyone with the slug can create an account on your roster. That is how a QR poster on the wall is supposed to work, but it means a stranger who photographs the poster lands on your Team tab. Options: leave it open (current intent), or mark self-joins as "pending" and require owner approval before they count as staff. I lean toward pending-approval, but it changes the owner's workflow, so I want your call.
2. **Slug editing.** Changing a slug breaks previously printed QR posters. I'd keep the old slug working as an alias rather than hard-breaking it — say if you'd rather keep it simple and let old links 404.
3. **Blank-name tenants** get a random-suffix slug that looks ugly on a poster. Alternative is to block sharing the join link until the restaurant name is set.

## Technical notes

- New: `profiles.slug` (unique, case-insensitive index), slug allocation function, `get_public_join_restaurant`, `join_restaurant_by_slug`, backfill — one migration.
- New public (unauthenticated) server function for slug resolution; the join submission calls the claim function through the browser client after auth, matching the existing invite pattern.
- Changed: `src/routes/join.$slug.tsx` (server resolution, three render states, real submit path), `src/components/sidework/StaffOnboarding.tsx` and the manager join-link display (read slug from the database), `src/lib/sidework-store.tsx` (`joinStaff` local-only write and `updateRestaurantSlug` become database-backed), `src/lib/slug.ts` (drop the shared `"team"` fallback).
- Untouched: Menu Knowledge Test, quiz gating, Stripe checkout, Stripe webhook, `/signup`, `/dev-signup`.
