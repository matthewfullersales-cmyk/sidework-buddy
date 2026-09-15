# Pricing page and checkout update

## Scope
Change only:
- `src/routes/pricing.tsx`
- `src/lib/stripe-checkout.functions.ts`
- `src/routes/index.tsx`

## Implementation
- Remove promotion-code support and the stale checkout comment without altering checkout behavior otherwise.
- Update the homepage shadow-shift sentence, add the Pricing navigation link, and replace only the closing call-to-action section.
- Rebuild the pricing page with the supplied copy, existing visual language, responsive pricing/comparison layouts, and the shared authentication-aware checkout block.
- Preserve the existing Home and Sign in pricing navigation and copy the homepage footer exactly.

## Verification
- Run the TypeScript check.
- Verify `/` and `/pricing` at desktop and 390px widths, including horizontal overflow and visible CTA states.
- Confirm the preview build remains healthy and only the three scoped files changed.
