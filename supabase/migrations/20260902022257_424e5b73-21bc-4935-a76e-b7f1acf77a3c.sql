CREATE TABLE public.interview_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','booked','closed')),
  interview_id uuid NULL REFERENCES public.interviews(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT interview_slots_owner_date_time_key UNIQUE (owner_id, slot_date, slot_time)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.interview_slots TO authenticated;
GRANT ALL ON public.interview_slots TO service_role;

ALTER TABLE public.interview_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Managers can view their interview slots" ON public.interview_slots
  FOR SELECT TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));
CREATE POLICY "Managers can add interview slots" ON public.interview_slots
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));
CREATE POLICY "Managers can update their interview slots" ON public.interview_slots
  FOR UPDATE TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id))
  WITH CHECK (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));
CREATE POLICY "Managers can delete their interview slots" ON public.interview_slots
  FOR DELETE TO authenticated
  USING (public.can_manage_schedule_for(owner_id) OR public.can_manage_hiring_for(owner_id));

CREATE INDEX interview_slots_owner_date_idx ON public.interview_slots (owner_id, slot_date);

CREATE TRIGGER update_interview_slots_updated_at
  BEFORE UPDATE ON public.interview_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interview_interval_minutes integer NULL;