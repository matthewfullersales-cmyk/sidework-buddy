ALTER TABLE public.people
  ADD COLUMN weekly_availability jsonb,
  ADD COLUMN invite_token uuid,
  ADD COLUMN invite_expires_at timestamp with time zone,
  ADD COLUMN invited_at timestamp with time zone,
  ADD COLUMN joined_via text,
  ADD COLUMN onboarding_started boolean NOT NULL DEFAULT false,
  ADD COLUMN personal_info_complete boolean NOT NULL DEFAULT false,
  ADD COLUMN push_opt_in boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX people_invite_token_unique ON public.people (invite_token) WHERE invite_token IS NOT NULL;

ALTER TABLE public.people
  DROP CONSTRAINT people_state_check,
  ADD CONSTRAINT people_state_check CHECK (state = ANY (ARRAY['applicant'::text, 'interviewing'::text, 'shadow'::text, 'hired'::text, 'active'::text, 'inactive'::text, 'rejected'::text, 'pending_approval'::text]));