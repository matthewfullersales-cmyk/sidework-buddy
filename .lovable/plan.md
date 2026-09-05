# Careers submissions: investigation result

## Short answer

Nothing is broken, and this is not related to the AI-scoring removal. Both of your test
applications were saved successfully — just not in the table you were looking at.

Applications no longer write to `job_applications`. The public form writes a single
person record into the unified `people` table (applicant → hired → active lifecycle).
`job_applications` is a legacy table with 4 old rows and no live writer.

## What the two submissions actually did

Database check for `%scorecheck%`:

- One person row exists: ScoreCheck Testroster, state `applicant`, source `careers`,
  job `a81ad87e-…`, created 19:35 UTC, `applied_at` updated to 19:37 UTC.
- The second submission did not create a second row because the intake function
  matches an existing, non-archived person by **email OR normalized phone**. Your
  second test used the same phone number, so it matched the first record and bumped
  `applied_at` / `submission_count` instead of inserting a new person. That is the
  designed anti-duplicate behavior, not a failure.

## Answers to the specific questions

1. The form is `src/routes/careers.tsx`. Its submit handler is at lines 87–117.
2. The "Thanks" screen is honest: line 98 dynamically imports
   `submitApplication` from `src/lib/people-supabase.ts`, line 99 `await`s it,
   and `setDone(true)` only runs after that awaited call resolves. Any error is
   caught and shown as a toast, with no success screen.
   That helper (people-supabase.ts:310) calls the `submit_application` database
   function and throws on error.
3. The AI-scoring change is unrelated. It touched `insertApplication` in
   `hiring-supabase.ts` and the store's `submitApplication` in `sidework-store.tsx`.
   The careers page shadows the store version with the dynamic import and explicitly
   discards it (`void submitApplication;` at line 118). The store path has no other
   caller, so nothing in the live intake path changed.

## Follow-up: does the live path have its own applicant score? — No

Checked every layer of the real intake path:

1. **Intake helper** (`src/lib/people-supabase.ts:310`) — no score/quality/rating
   logic; it passes name, contact info, availability, and the two structured
   experience answers straight through.
2. **Database function** (`submit_application`) — full body read; no scoring
   anywhere. It sanitizes input, resolves the restaurant, throttles bursts, and
   dedupes by email/phone. Nothing derived from application completeness.
3. **`people` table** — column list confirmed: no `ai_score`, `applicant_score`,
   `quality_score`, or anything similar. The only counters are `submission_count`.
4. **Manager applicant UI** (`src/components/sidework/ApplicantPipeline.tsx`, the
   live pipeline reading `people`) — no score display. A full-tree sweep found the
   only remaining "score" hits are: shift-suggestion sorting, the dormant menu-quiz
   code, and the generated `ai_score` type declarations for the legacy
   `job_applications` table.

Conclusion: the scoring feature you removed earlier was the only one, and the live
path never had an equivalent. The discrimination exposure is fully removed from the
live product.

Adjacent flag, not a score: the manager interview-notes field is a free-text box
("Strengths, concerns, follow-ups…") written about a candidate pre-decision, which
conflicts with the standing "no free text about a person before a decision" rule.
Separate issue; nothing changed.

## Optional follow-ups (say the word and I'll plan them)

- Delete the dead store `submitApplication` / `insertApplication` path and the unused
  store import in `careers.tsx`, so there is only one intake path.
- Retire the legacy `job_applications` table (separate database step).
- Replace interview notes with structured capture (separate scoped task).
- Test with a distinct phone number as well as a distinct email when you want two rows.
