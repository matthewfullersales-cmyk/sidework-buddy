ALTER TABLE public.shifts DROP CONSTRAINT shifts_employee_id_fkey;
ALTER TABLE public.shifts ADD CONSTRAINT shifts_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.people(id) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE public.time_off_requests DROP CONSTRAINT time_off_requests_employee_id_fkey;
ALTER TABLE public.time_off_requests ADD CONSTRAINT time_off_requests_employee_id_fkey FOREIGN KEY (employee_id) REFERENCES public.people(id) ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE public.shift_trades DROP CONSTRAINT shift_trades_posted_by_fkey;
ALTER TABLE public.shift_trades ADD CONSTRAINT shift_trades_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.people(id) ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE public.shift_trades DROP CONSTRAINT shift_trades_claimed_by_fkey;
ALTER TABLE public.shift_trades ADD CONSTRAINT shift_trades_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES public.people(id) ON DELETE SET NULL ON UPDATE NO ACTION;