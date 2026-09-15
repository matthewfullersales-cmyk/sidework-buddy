ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.subscription_cancel_at_period_end IS
  'True when the customer has cancelled but the period they already paid for has not ended yet. Written only from the Stripe webhook.';