// Manager-facing applicant pipeline built on the unified person record (public.people).
// State changes always go through setPersonState (the manager-only RPC) — never a
// direct update of `state`.
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PersonAvatar } from "@/components/sidework/PersonAvatar";
import { InterviewOfferDialog } from "@/components/sidework/InterviewOfferDialog";
import { formatPhone } from "@/lib/format-phone";
import { formatDateLong, formatTime12h } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { copyLinkWithToast } from "@/lib/copy-to-clipboard";
import { sendApplicantNotification } from "@/lib/applicant-notifications.functions";

import {
  fetchInterviewsForPeople,
  cancelInterview,
  type Interview,
} from "@/lib/interviews-supabase";
import { useStore } from "@/lib/sidework-store";
import { allRolesWithCustom } from "@/lib/role-colors";
import { shadowSectionForRole, dressGroupForRole } from "@/lib/shadow-packet-roles";
import { fetchShadowPacket, emptyShadowPacket, type ShadowPacket } from "@/lib/employees-supabase";
import {
  fetchShadowShiftsForPeople,
  createShadowShift,
  updateShadowShift,
  cancelShadowShift,
  type ShadowShift,
} from "@/lib/shadow-shifts-supabase";
import {
  fetchPeople,
  setPersonState,
  hirePerson,
  regeneratePersonInvite,
  archivePerson,
  type Person,
  type PersonState,
} from "@/lib/people-supabase";


/** Postgres time values arrive as "HH:MM:SS"; form inputs hold "HH:MM". */
const hhmm = (t: string) => (t ?? "").slice(0, 5);

const PIPELINE_STATES: PersonState[] = ["applicant", "interviewing", "shadow", "hired", "rejected"];

const STATE_LABEL: Record<PersonState, string> = {
  applicant: "Applicants",
  interviewing: "Interviewing",
  shadow: "Shadow shift",
  hired: "Hired",
  rejected: "Passed",
  active: "Active",
  inactive: "Inactive",
};

const NEXT_STATE: Partial<Record<PersonState, PersonState>> = {
  applicant: "interviewing",
  interviewing: "shadow",
  shadow: "hired",
};

function relativeDate(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.round(months / 12)} year${months >= 24 ? "s" : ""} ago`;
}

const longDate = formatDateLong;

/**
 * How far ahead of the shift the trainee declined. Display-only and
 * approximate: the shift stores a local date + time with no timezone, so this
 * is read against the manager's clock. Falls back to null when unparseable, and
 * the caller then shows the flat wording.
 */
function declineTiming(declinedAt: string | null, shiftDate: string, arrivalTime: string): string | null {
  if (!declinedAt) return null;
  const declined = new Date(declinedAt).getTime();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(shiftDate ?? "");
  const t = /^(\d{2}):(\d{2})/.exec(arrivalTime ?? "");
  if (Number.isNaN(declined) || !m || !t) return null;
  const arrival = new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]),
  ).getTime();
  if (Number.isNaN(arrival)) return null;
  const mins = Math.round((arrival - declined) / 60000);
  if (mins <= 0) return "Declined after the arrival time";
  if (mins < 60) return `Declined ${mins} minute${mins === 1 ? "" : "s"} before`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Declined ${hours} hour${hours === 1 ? "" : "s"} before`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Declined the day before";
  return `Declined ${days} days before`;
}

/** "Cancelled today" / "Cancelled N days ago", counting whole days. */
function cancelledAgo(iso: string): string | null {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const days = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  if (days === 0) return "Cancelled today — no new date";
  return `Cancelled ${days} day${days === 1 ? "" : "s"} ago — no new date`;
}


export function ApplicantPipeline() {
  const { effectiveOwner } = useAuth();
  const ownerId = effectiveOwner?.ownerId ?? null;

  const [people, setPeople] = useState<Person[]>([]);
  const [jobTitles, setJobTitles] = useState<Record<string, string>>({});
  const [jobRoles, setJobRoles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [interviews, setInterviews] = useState<Record<string, Interview>>({});
  const [offerFor, setOfferFor] = useState<Person | null>(null);
  const [hireFor, setHireFor] = useState<Person | null>(null);
  const [hireRole, setHireRole] = useState<string>("");
  const [shadowShifts, setShadowShifts] = useState<Record<string, ShadowShift>>({});
  // Newest cancelled shadow shift for people with no active one — drives the
  // passive "no new date" reminder on the card.
  const [cancelledShadow, setCancelledShadow] = useState<Record<string, ShadowShift>>({});

  const [shadowFor, setShadowFor] = useState<Person | null>(null);
  const [shadowEditing, setShadowEditing] = useState<ShadowShift | null>(null);
  const [shRole, setShRole] = useState<string>("");
  const [shDate, setShDate] = useState<string>("");
  const [shTime, setShTime] = useState<string>("");
  const [shTrainer, setShTrainer] = useState<string>("");
  const [shNote, setShNote] = useState<string>("");
  // Owner's dress-group overrides, needed to resolve the shadow shift row.
  const [shadowPacket, setShadowPacket] = useState<ShadowPacket>(emptyShadowPacket);
  const [shadowPacketLoaded, setShadowPacketLoaded] = useState(false);


  // Single source of truth for roles: the restaurant's configured role list.
  const { customRoles, activeRoles, shifts } = useStore();
  const roleChoices = useMemo(
    () => allRolesWithCustom(customRoles).filter((r) => activeRoles.includes(r)),
    [customRoles, activeRoles],
  );


  // Newest non-cancelled interview per person.
  const loadInterviews = async (rows: Person[]) => {
    try {
      const list = await fetchInterviewsForPeople(rows.map((p) => p.id));
      const map: Record<string, Interview> = {};
      for (const iv of list) {
        if (iv.status === "cancelled") continue;
        if (!map[iv.personId]) map[iv.personId] = iv;
      }
      setInterviews(map);
    } catch (e) {
      console.error("[pipeline] interviews load failed", e);
    }
  };

  // Newest non-cancelled shadow shift per person, plus the newest cancelled one
  // for anyone left with no replacement (the stale-cancel reminder).
  const loadShadowShifts = async (rows: Person[]) => {
    try {
      const list = await fetchShadowShiftsForPeople(rows.map((p) => p.id));
      const map: Record<string, ShadowShift> = {};
      const cancelled: Record<string, ShadowShift> = {};
      for (const ss of list) {
        if (ss.status === "cancelled") {
          if (!cancelled[ss.personId]) cancelled[ss.personId] = ss;
          continue;
        }
        if (!map[ss.personId]) map[ss.personId] = ss;
      }
      for (const pid of Object.keys(map)) delete cancelled[pid];
      setShadowShifts(map);
      setCancelledShadow(cancelled);
    } catch (e) {
      console.error("[pipeline] shadow shifts load failed", e);
    }
  };


  const load = async (oid: string) => {
    setLoading(true);
    try {
      const rows = await fetchPeople(oid, { archived: showArchived ? undefined : false });
      setPeople(rows);
      await loadInterviews(rows);
      await loadShadowShifts(rows);
    } catch (e) {
      console.error("[pipeline] load failed", e);
      toast.error("Couldn't load applicants.");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (!ownerId) return;
    void load(ownerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, showArchived]);

  useEffect(() => {
    if (!ownerId) return;
    void (async () => {
      const { data } = await supabase
        .from("job_postings")
        .select("id, title, role")
        .eq("owner_id", ownerId);
      const map: Record<string, string> = {};
      const roles: Record<string, string> = {};
      for (const j of (data ?? []) as { id: string; title: string; role: string | null }[]) {
        map[j.id] = j.title;
        if (j.role) roles[j.id] = j.role;
      }
      setJobTitles(map);
      setJobRoles(roles);
    })();
  }, [ownerId]);

  // The shadow packet is per-restaurant, so load it once for the owner rather
  // than on every dialog open.
  useEffect(() => {
    if (!ownerId) return;
    void fetchShadowPacket(ownerId)
      .then((p) => {
        setShadowPacket(p);
        setShadowPacketLoaded(true);
      })
      .catch((e) => console.error("[pipeline] shadow packet load failed", e));
  }, [ownerId]);


  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const rows = showArchived ? people : people.filter((p) => !p.archived);
    if (!q) return rows;
    return rows.filter((p) => {
      const name = `${p.firstName} ${p.lastName}`.toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      const phoneDigits = (p.phone ?? "").replace(/\D/g, "");
      return (
        name.includes(q) ||
        email.includes(q) ||
        (digits.length >= 3 && phoneDigits.includes(digits))
      );
    });
  }, [people, query, showArchived]);

  const grouped = useMemo(() => {
    const g: Record<string, Person[]> = {};
    for (const s of PIPELINE_STATES) g[s] = [];
    for (const p of filtered) if (g[p.state]) g[p.state]!.push(p);
    return g;
  }, [filtered]);

  const openPerson = people.find((p) => p.id === openId) ?? null;

  const move = async (person: Person, next: PersonState) => {
    setBusy(true);
    try {
      const updated = await setPersonState(person.id, next);
      setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(`${person.firstName} moved to ${STATE_LABEL[next]}`);
    } catch (e) {
      console.error("[pipeline] state change failed", e);
      toast.error("Couldn't update this person.");
    } finally {
      setBusy(false);
    }
  };

  const hire = async (person: Person, role: string) => {
    setBusy(true);
    try {
      const updated = await hirePerson(person.id, role);
      setPeople((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      toast.success(`${person.firstName} hired as ${role}`);
      setHireFor(null);
      setHireRole("");
      // The hire is done. Inviting them to sign up is best-effort and must
      // never roll the hire back.
      if (updated.inviteToken) {
        if (updated.email) {
          await sendHireInvite(updated);
        } else {
          toast.warning("No email on file — copy the invite link and give it to them.");
        }
      }
    } catch (e) {
      console.error("[pipeline] hire failed", e);
      toast.error("Couldn't hire this person.");
    } finally {
      setBusy(false);
    }
  };

  const archive = async (person: Person) => {
    setBusy(true);
    try {
      const updated = await archivePerson(person.id, !person.archived);
      setPeople((prev) =>
        showArchived
          ? prev.map((p) => (p.id === updated.id ? updated : p))
          : prev.filter((p) => p.id !== updated.id || !updated.archived),
      );
      setOpenId(null);
      toast.success(updated.archived ? "Archived" : "Restored");
    } catch (e) {
      console.error("[pipeline] archive failed", e);
      toast.error("Couldn't archive this person.");
    } finally {
      setBusy(false);
    }
  };

  const dropInterview = async (person: Person) => {
    const iv = interviews[person.id];
    if (!iv) return;
    setBusy(true);
    try {
      await cancelInterview(iv.id);
      setInterviews((prev) => {
        const next = { ...prev };
        delete next[person.id];
        return next;
      });
      toast.success("Interview cancelled");
    } catch (e) {
      console.error("[pipeline] cancel interview failed", e);
      toast.error("Couldn't cancel that interview.");
    } finally {
      setBusy(false);
    }
  };

  /** Roster people who can train the selected role, ordered by usefulness. */
  const trainerCandidates = useMemo(() => {
    if (!shRole) return [] as { id: string; name: string; label: string; rank: number }[];
    const roster = people.filter((p) => p.state === "hired" || p.state === "active");
    const rows = roster
      .filter(
        (p) =>
          (p.isTrainerForRoles ?? []).includes(shRole) ||
          (p.approvedRoles ?? []).includes(shRole),
      )
      .map((p) => {
        const flagged = (p.isTrainerForRoles ?? []).includes(shRole);
        // "Scheduled that date" comes from the shifts already in the store —
        // no extra server query.
        const onShift = shDate ? shifts.filter((sh) => sh.date === shDate && sh.employeeId === p.id) : [];
        const scheduled = onShift.length > 0;
        const label = scheduled
          ? onShift.map((sh) => `${formatTime12h(sh.start)}–${formatTime12h(sh.end)}`).join(", ")
          : "Not scheduled";
        const rank = flagged && scheduled ? 0 : scheduled ? 1 : flagged ? 2 : 3;
        return { id: p.id, name: `${p.firstName} ${p.lastName}`.trim(), label, rank };
      });
    rows.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
    return rows;
  }, [people, shifts, shRole, shDate]);

  const anyFlaggedTrainer = useMemo(
    () =>
      !!shRole &&
      people.some(
        (p) =>
          (p.state === "hired" || p.state === "active") &&
          (p.isTrainerForRoles ?? []).includes(shRole),
      ),
    [people, shRole],
  );

  const personName = (id: string | null) => {
    if (!id) return null;
    const p = people.find((x) => x.id === id);
    return p ? `${p.firstName} ${p.lastName}`.trim() : null;
  };

  const openShadowDialog = (person: Person, existing: ShadowShift | null) => {

    setShadowEditing(existing);
    setShRole(existing?.role ?? (person.jobId ? (jobRoles[person.jobId] ?? "") : ""));
    setShDate(existing?.shiftDate ?? "");
    setShTime((existing?.arrivalTime ?? "").slice(0, 5));
    setShTrainer(existing?.trainerPersonId ?? "");
    setShNote(existing?.note ?? "");
    setShadowFor(person);
    setOpenId(null);
  };

  const closeShadowDialog = () => {
    setShadowFor(null);
    setShadowEditing(null);
  };

  const saveShadowShift = async () => {
    if (!shadowFor || !shRole || !shDate || !shTime) return;
    setBusy(true);
    // Department and dress group are resolved HERE, where customRoles and the
    // owner's overrides exist, then stored on the row. The trainee page does
    // no classification of its own. Never resolve from an unloaded packet.
    let packet = shadowPacket;
    if (!shadowPacketLoaded) {
      const oid = ownerId ?? shadowFor.ownerId;
      if (!oid) {
        setBusy(false);
        toast.error("Couldn't load your shadow shift settings. Try again.");
        return;
      }
      try {
        packet = await fetchShadowPacket(oid);
        setShadowPacket(packet);
        setShadowPacketLoaded(true);
      } catch (e) {
        console.error("[pipeline] shadow packet load failed", e);
        setBusy(false);
        toast.error("Couldn't load your shadow shift settings. Try again.");
        return;
      }
    }
    const section = shadowSectionForRole(shRole, customRoles);
    const dressGroup = dressGroupForRole(shRole, customRoles, packet.dressGroup);

    try {
      const saved = shadowEditing
        ? await updateShadowShift({
            id: shadowEditing.id,
            shiftDate: shDate,
            arrivalTime: shTime,
            trainerPersonId: shTrainer || null,
            note: shNote.trim() || null,
            section,
            dressGroup,
          })
        : await createShadowShift({
            personId: shadowFor.id,
            role: shRole,
            shiftDate: shDate,
            arrivalTime: shTime,
            trainerPersonId: shTrainer || null,
            note: shNote.trim() || null,
            section,
            dressGroup,
          });
      setShadowShifts((prev) => ({ ...prev, [saved.personId]: saved }));
      // A new date exists again — clear any stale-cancel reminder.
      setCancelledShadow((prev) => {
        if (!prev[saved.personId]) return prev;
        const next = { ...prev };
        delete next[saved.personId];
        return next;
      });

      if (!shadowEditing) {
        setPeople((prev) =>
          prev.map((p) =>
            p.id === saved.personId
              ? { ...p, state: "shadow", stateChangedAt: new Date().toISOString() }
              : p,
          ),
        );
      }
      // Mirrors the server rule in update_shadow_shift: a reschedule (date or
      // arrival time moved) clears the trainee's confirmation, so they must be
      // emailed again. Trainer, note, section or dress-group changes must NOT.
      // Postgres returns time as "HH:MM:SS" while the form holds "HH:MM", so
      // times are compared on the first five characters only; dates are plain
      // YYYY-MM-DD strings on both sides.
      const moved =
        !!shadowEditing &&
        (shadowEditing.shiftDate !== saved.shiftDate ||
          hhmm(shadowEditing.arrivalTime) !== hhmm(saved.arrivalTime));
      if (!shadowEditing) toast.success("Shadow shift scheduled");
      else if (!moved) toast.success("Shadow shift updated — no email sent (time unchanged)");
      const target = shadowFor;
      closeShadowDialog();
      if (!shadowEditing) await sendShadowInvite(target, saved);
      else if (moved) await sendShadowMoved(target, saved);
    } catch (e) {
      console.error("[pipeline] shadow shift save failed", e);
      toast.error("Couldn't save that shadow shift.");
    } finally {
      setBusy(false);
    }
  };

  const shadowLink = (ss: ShadowShift) =>
    `${typeof window === "undefined" ? "" : window.location.origin}/shadow/t/${ss.publicToken}`;

  /** Emails the trainee that the date/arrival time moved and needs re-confirming. */
  const sendShadowMoved = async (person: Person, ss: ShadowShift) => {
    const link = shadowLink(ss);
    let ok = false;
    let attempted = false;
    let err: string | undefined;
    try {
      const res = await sendApplicantNotification({ data: {
        kind: "shadow_moved",
        link,
        firstName: person.firstName ?? "",
        restaurantName: effectiveOwner?.restaurantName ?? "",
        email: person.email ?? "",
        shadowDate: formatDateLong(ss.shiftDate),
        shadowDateSubject: formatDateWithWeekday(ss.shiftDate),
        shadowTime: formatTime12h(ss.arrivalTime.slice(0, 5)),
      }});
      ok = res.email.ok;
      attempted = res.email.attempted;
      err = res.email.error;
    } catch (e) {
      console.error("[pipeline] shadow moved email failed", e);
    }
    if (ok) {
      toast.success(`New time emailed to ${person.firstName} — their previous confirmation was cleared`, { description: link });
    } else {
      const why = attempted ? `email failed${err ? `: ${err}` : ""}` : "no email on file";
      toast.warning(`${person.firstName} was NOT emailed the new time — send it manually (${why})`);
      copyLinkWithToast(link, "Shadow shift link copied");
    }
  };

  /** Cancels the shadow shift, then tells the trainee. Email never blocks the cancel. */
  const dropShadowShift = async (person: Person) => {
    const ss = shadowShifts[person.id];
    if (!ss) return;
    setBusy(true);
    try {
      await cancelShadowShift(ss.id);
      setShadowShifts((prev) => {
        const next = { ...prev };
        delete next[person.id];
        return next;
      });
      setCancelledShadow((prev) => ({
        ...prev,
        [person.id]: { ...ss, status: "cancelled", updatedAt: new Date().toISOString() },
      }));
      toast.success("Shadow shift cancelled");

    } catch (e) {
      console.error("[pipeline] cancel shadow shift failed", e);
      toast.error("Couldn't cancel that shadow shift.");
      setBusy(false);
      return;
    }
    setBusy(false);
    let ok = false;
    let attempted = false;
    let err: string | undefined;
    try {
      const res = await sendApplicantNotification({ data: {
        kind: "shadow_cancelled",
        firstName: person.firstName ?? "",
        restaurantName: effectiveOwner?.restaurantName ?? "",
        email: person.email ?? "",
        shadowDate: formatDateLong(ss.shiftDate),
        shadowTime: formatTime12h(ss.arrivalTime.slice(0, 5)),
      }});
      ok = res.email.ok;
      attempted = res.email.attempted;
      err = res.email.error;
    } catch (e) {
      console.error("[pipeline] shadow cancelled email failed", e);
    }
    if (ok) toast.success(`${person.firstName} was emailed that it's cancelled`);
    else {
      const why = attempted ? `email failed${err ? `: ${err}` : ""}` : "no email on file";
      toast.warning(`${person.firstName} was NOT told it's cancelled — reach out directly (${why})`);
    }

  };

  /** Emails the trainee their shadow shift link; falls back to a copyable link. */
  const sendShadowInvite = async (person: Person, ss: ShadowShift, resend = false) => {
    const link = shadowLink(ss);
    let ok = false;
    let attempted = false;
    let err: string | undefined;
    try {
      const res = await sendApplicantNotification({ data: {
        kind: "shadow_invite",
        link,
        firstName: person.firstName ?? "",
        restaurantName: effectiveOwner?.restaurantName ?? "",
        email: person.email ?? "",
        shadowDate: formatDateLong(ss.shiftDate),
        shadowDateSubject: formatDateWithWeekday(ss.shiftDate),
        shadowTime: formatTime12h(ss.arrivalTime.slice(0, 5)),
      }});
      ok = res.email.ok;
      attempted = res.email.attempted;
      err = res.email.error;
    } catch (e) {
      console.error("[pipeline] shadow invite email failed", e);
    }
    if (ok) {
      toast.success(`Shadow shift ${resend ? "re-sent" : "emailed"} to ${person.firstName}`, { description: link });
    } else {
      const why = attempted ? `email failed${err ? `: ${err}` : ""}` : "no email on file";
      toast.warning(`Link ready for ${person.firstName} — send it manually (${why})`);
      copyLinkWithToast(link, "Shadow shift link copied");
    }
  };


  const interviewLink = (iv: Interview) =>
    `${typeof window === "undefined" ? "" : window.location.origin}/interview/t/${iv.publicToken}`;

  /** Re-sends the existing offer email. Creates nothing and changes no state. */
  const resendOffer = async (person: Person, iv: Interview) => {
    if (!person.email) {
      toast.warning("No email on file — use Copy link instead.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendApplicantNotification({ data: {
        kind: "interview_offer",
        link: interviewLink(iv),
        firstName: person.firstName ?? "",
        restaurantName: effectiveOwner?.restaurantName ?? "",
        email: person.email,
        slotCount: iv.offeredSlots.length,
        interviewType: iv.interviewType,
      }});
      if (res.email.ok) toast.success(`Interview invite re-sent to ${person.email}`);
      else toast.error(`Couldn't send that email${res.email.error ? `: ${res.email.error}` : ""}`);
    } catch (e) {
      console.error("[pipeline] resend interview email failed", e);
      toast.error("Couldn't send that email.");
    } finally {
      setBusy(false);
    }
  };


  const inviteLink = (person: Person) =>
    `${typeof window === "undefined" ? "" : window.location.origin}/staff-invite/${person.inviteToken}`;

  /** Sends (or re-sends) the sign-up invite using the person's EXISTING token. */
  const sendHireInvite = async (person: Person, resend = false) => {
    if (!person.email || !person.inviteToken) {
      toast.warning("No email on file — use Copy invite link instead.");
      return;
    }
    try {
      const res = await sendApplicantNotification({ data: {
        kind: "hire_signup",
        link: inviteLink(person),
        firstName: person.firstName ?? "",
        restaurantName: effectiveOwner?.restaurantName ?? "",
        email: person.email,
      }});
      if (res.email.ok) {
        toast.success(`${resend ? "Invite re-sent" : "Invite sent"} to ${person.email}`);
      } else {
        toast.error(`Couldn't send that email${res.email.error ? `: ${res.email.error}` : ""}`);
      }
    } catch (e) {
      console.error("[pipeline] hire invite email failed", e);
      toast.error("Couldn't send that email.");
    }
  };

  /** Mints a fresh token — only offered once the current invite has expired. */
  const reissueInvite = async (person: Person) => {
    setBusy(true);
    try {
      const token = await regeneratePersonInvite(person.id);
      const updated: Person = { ...person, inviteToken: token, invitedAt: new Date().toISOString() };
      setPeople((prev) => prev.map((p) => (p.id === person.id ? updated : p)));
      if (updated.email) await sendHireInvite(updated, true);
      else toast.success("New invite link created — copy it and give it to them.");
    } catch (e) {
      console.error("[pipeline] reissue invite failed", e);
      toast.error("Couldn't create a new invite link.");
    } finally {
      setBusy(false);
    }
  };

  const openResume = async (path: string) => {
    const { data, error } = await supabase.storage.from("resumes").createSignedUrl(path, 60);
    if (error || !data?.signedUrl) {
      toast.error("Couldn't open that resume.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const totalPeople = people.length;

  return (
    <Card>
      <CardHeader className="gap-3">
        <CardTitle className="text-base">Applicants</CardTitle>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, or phone"
            className="sm:max-w-xs"
          />
          <div className="flex items-center gap-2">
            <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
            <Label htmlFor="show-archived" className="text-xs text-muted-foreground">Show archived</Label>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && totalPeople === 0 && (
          <p className="text-sm text-muted-foreground">
            No applications yet. When someone applies through one of your job links, they show up here.
          </p>
        )}

        {!loading && totalPeople > 0 && PIPELINE_STATES.map((state) => {
          const rows = grouped[state] ?? [];
          return (
            <section key={state}>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold">{STATE_LABEL[state]}</h3>
                <Badge variant="secondary">{rows.length}</Badge>
              </div>
              {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground">None</p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((p) => {
                    const next = NEXT_STATE[p.state];
                    return (
                      <li key={p.id}>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => setOpenId(p.id)}
                          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpenId(p.id); }}
                          className="w-full cursor-pointer rounded-lg border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="flex items-start gap-3">
                            <PersonAvatar id={p.id} firstName={p.firstName} lastName={p.lastName} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold">{p.firstName} {p.lastName}</p>
                              {p.phone && <p className="text-sm text-muted-foreground">{formatPhone(p.phone)}</p>}
                              {p.email && <p className="truncate text-sm text-muted-foreground">{p.email}</p>}
                              <p className="mt-1 text-xs text-muted-foreground">
                                Applied {relativeDate(p.appliedAt ?? p.createdAt)}
                                {p.jobId && jobTitles[p.jobId] ? ` · ${jobTitles[p.jobId]}` : ""}
                                {p.archived ? " · archived" : ""}
                              </p>
                              {shadowShifts[p.id]?.declinedAt && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {declineTiming(
                                    shadowShifts[p.id]!.declinedAt,
                                    shadowShifts[p.id]!.shiftDate,
                                    shadowShifts[p.id]!.arrivalTime,
                                  ) ?? "Said they can't make it"}
                                </p>
                              )}
                              {!shadowShifts[p.id] && cancelledShadow[p.id] && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {cancelledAgo(cancelledShadow[p.id]!.updatedAt) ?? "Cancelled — no new date"}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                            {next && p.state !== "applicant" && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  next === "shadow"
                                    ? openShadowDialog(p, shadowShifts[p.id] ?? null)
                                    : void move(p, next)
                                }
                              >
                                Move to {STATE_LABEL[next]}
                              </Button>
                            )}
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void archive(p)}>
                              {p.archived ? "Restore" : "Archive"}
                            </Button>
                          </div>

                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </CardContent>

      <Dialog open={!!openPerson} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          {openPerson && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <PersonAvatar id={openPerson.id} firstName={openPerson.firstName} lastName={openPerson.lastName} size="lg" />
                  <span>{openPerson.firstName} {openPerson.lastName}</span>
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-2 py-2 text-sm">
                <p className="text-muted-foreground">
                  {STATE_LABEL[openPerson.state]} · {openPerson.jobId && jobTitles[openPerson.jobId] ? jobTitles[openPerson.jobId] : "No job posting"}
                </p>
                {openPerson.phone && <p>{formatPhone(openPerson.phone)}</p>}
                {openPerson.email && <p className="break-all">{openPerson.email}</p>}
                <p className="text-xs text-muted-foreground">
                  Applied {longDate(openPerson.appliedAt ?? openPerson.createdAt)}
                  {openPerson.state !== "applicant"
                    ? ` · in ${STATE_LABEL[openPerson.state]} since ${longDate(openPerson.stateChangedAt)}`
                    : ""}
                </p>


                {openPerson.emergencyContact && (openPerson.emergencyContact.name || openPerson.emergencyContact.phone) && (
                  <div className="mt-2 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold">Emergency contact</p>
                    <p className="text-sm">
                      {openPerson.emergencyContact.name}
                      {openPerson.emergencyContact.relationship ? ` (${openPerson.emergencyContact.relationship})` : ""}
                    </p>
                    {openPerson.emergencyContact.phone && (
                      <p className="text-sm text-muted-foreground">{formatPhone(openPerson.emergencyContact.phone)}</p>
                    )}
                  </div>
                )}

                {openPerson.resumePath && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-fit"
                    onClick={() => void openResume(openPerson.resumePath!)}
                  >
                    View resume
                  </Button>
                )}

                {interviews[openPerson.id] && (
                  <div className="mt-2 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold">
                      Interview · {interviews[openPerson.id]!.interviewType === "phone" ? "Phone call" : "In person"}
                    </p>
                    {interviews[openPerson.id]!.status === "scheduled" && interviews[openPerson.id]!.selectedSlot ? (
                      <p className="text-sm">
                        Confirmed for{" "}
                        {new Date(interviews[openPerson.id]!.selectedSlot!).toLocaleString(undefined, {
                          weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                        })}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {interviews[openPerson.id]!.offeredSlots.length} time
                        {interviews[openPerson.id]!.offeredSlots.length === 1 ? "" : "s"} offered — waiting on them to pick
                      </p>
                    )}
                    {interviews[openPerson.id]!.status !== "completed" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            copyLinkWithToast(interviewLink(interviews[openPerson.id]!), "Interview link copied")
                          }
                        >
                          Copy link
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => void resendOffer(openPerson, interviews[openPerson.id]!)}
                        >
                          Resend email
                        </Button>
                      </div>
                    )}
                  </div>

                )}

                {openPerson.state === "hired" && (
                  <div className="mt-2 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold">Sign-up invite</p>
                    <p className="text-sm">
                      {openPerson.invitedAt
                        ? `Invite sent ${new Date(openPerson.invitedAt).toLocaleString(undefined, {
                            month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          })}`
                        : "No invite sent yet"}
                      {openPerson.email ? "" : " · no email on file"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {openPerson.authUserId
                        ? openPerson.personalInfoComplete
                          ? "Signed up · profile complete"
                          : "Signed up · profile not finished yet"
                        : "Hasn't signed up yet"}
                    </p>
                    {!openPerson.authUserId
                      && openPerson.inviteExpiresAt
                      && new Date(openPerson.inviteExpiresAt).getTime() < Date.now() && (
                      <p className="text-xs text-destructive">
                        This invite link has expired. Re-issue it to send a new one.
                      </p>
                    )}
                    {!openPerson.authUserId && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {openPerson.inviteToken && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyLinkWithToast(inviteLink(openPerson), "Invite link copied")}
                          >
                            Copy invite link
                          </Button>
                        )}
                        {openPerson.inviteToken && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy || !openPerson.email}
                            onClick={() => void sendHireInvite(openPerson, true)}
                          >
                            Resend invite
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => void reissueInvite(openPerson)}
                        >
                          Re-issue link
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {shadowShifts[openPerson.id] && (
                  <div className="mt-2 rounded-lg border border-border p-3">
                    <p className="text-xs font-semibold">
                      Shadow shift · {shadowShifts[openPerson.id]!.role}
                    </p>
                    <p className="text-sm">
                      {longDate(shadowShifts[openPerson.id]!.shiftDate)} · arrive{" "}
                      {formatTime12h(shadowShifts[openPerson.id]!.arrivalTime.slice(0, 5))}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {personName(shadowShifts[openPerson.id]!.trainerPersonId) ?? "No trainer assigned"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {shadowShifts[openPerson.id]!.confirmedAt
                        ? "Confirmed"
                        : shadowShifts[openPerson.id]!.declinedAt
                          ? (declineTiming(
                              shadowShifts[openPerson.id]!.declinedAt,
                              shadowShifts[openPerson.id]!.shiftDate,
                              shadowShifts[openPerson.id]!.arrivalTime,
                            ) ?? "Said they can't make it")
                          : "Not confirmed yet"}
                    </p>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => openShadowDialog(openPerson, shadowShifts[openPerson.id]!)}
                      >
                        Edit shadow shift
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void sendShadowInvite(openPerson, shadowShifts[openPerson.id]!, true)}
                      >
                        Resend invite
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyLinkWithToast(shadowLink(shadowShifts[openPerson.id]!), "Shadow shift link copied")}
                      >
                        Copy link
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="sm" variant="ghost" disabled={busy}>
                            Cancel shadow shift
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Cancel {openPerson.firstName}&apos;s shadow shift?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This cancels the shadow shift and emails {openPerson.firstName} that it&apos;s
                              off. That email can&apos;t be unsent.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep it</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void dropShadowShift(openPerson)}>
                              Cancel shadow shift
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                  </div>
                )}
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button size="sm" disabled={busy} onClick={() => { setOfferFor(openPerson); setOpenId(null); }}>
                  {interviews[openPerson.id] ? "Re-offer interview" : "Schedule interview"}
                </Button>
                {interviews[openPerson.id] && interviews[openPerson.id]!.status !== "completed" && (
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void dropInterview(openPerson)}>
                    Cancel interview
                  </Button>
                )}
                <Button size="sm" disabled={busy} onClick={() => openShadowDialog(openPerson, shadowShifts[openPerson.id] ?? null)}>Move to Shadow</Button>
                <Button size="sm" disabled={busy || openPerson.state === "hired"} onClick={() => { setHireRole(""); setHireFor(openPerson); }}>Hire</Button>
                <Button size="sm" variant="outline" disabled={busy || openPerson.state === "rejected"} onClick={() => void move(openPerson, "rejected")}>Pass</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void archive(openPerson)}>
                  {openPerson.archived ? "Restore" : "Archive"}
                </Button>
              </DialogFooter>

            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!hireFor} onOpenChange={(o) => { if (!o) { setHireFor(null); setHireRole(""); } }}>
        <DialogContent className="sm:max-w-md">
          {hireFor && (
            <>
              <DialogHeader>
                <DialogTitle>Hire {hireFor.firstName} as…</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={hireRole} onValueChange={setHireRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roleChoices.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={() => { setHireFor(null); setHireRole(""); }}>Cancel</Button>
                <Button disabled={busy || !hireRole} onClick={() => void hire(hireFor, hireRole)}>Hire</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!shadowFor} onOpenChange={(o) => { if (!o) closeShadowDialog(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
          {shadowFor && (
            <>
              <DialogHeader>
                <DialogTitle>Schedule shadow shift for {shadowFor.firstName}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={shRole} onValueChange={setShRole} disabled={!!shadowEditing}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleChoices.map((r) => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="shadow-date">Date</Label>
                    <Input id="shadow-date" type="date" value={shDate} onChange={(e) => setShDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shadow-time">Arrival time</Label>
                    <Input id="shadow-time" type="time" value={shTime} onChange={(e) => setShTime(e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Trainer <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <Select
                    value={shTrainer || "none"}
                    onValueChange={(v) => setShTrainer(v === "none" ? "" : v)}
                    disabled={!shRole}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={shRole ? "Assign later" : "Pick a role first"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Assign later</SelectItem>
                      {trainerCandidates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name} <span className="text-muted-foreground">· {t.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {shRole && !anyFlaggedTrainer && (
                    <p className="text-xs text-muted-foreground">
                      No one is flagged to train {shRole} yet.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shadow-note">Anything else for this shift? <span className="text-xs font-normal text-muted-foreground">(optional)</span></Label>
                  <p className="text-xs text-muted-foreground">Shown to {shadowFor.firstName} in their invite.</p>
                  <Textarea id="shadow-note" rows={3} value={shNote} onChange={(e) => setShNote(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={closeShadowDialog}>Cancel</Button>
                <Button disabled={busy || !shRole || !shDate || !shTime} onClick={() => void saveShadowShift()}>
                  {shadowEditing ? "Save changes" : "Schedule"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {offerFor && ownerId && (
        <InterviewOfferDialog
          person={offerFor}
          ownerId={ownerId}
          restaurantName={effectiveOwner?.restaurantName ?? ""}
          onClose={() => setOfferFor(null)}
          onCreated={(iv) => {
            setInterviews((prev) => ({ ...prev, [iv.personId]: iv }));
            setPeople((prev) =>
              prev.map((p) =>
                p.id === iv.personId
                  ? { ...p, state: "interviewing", stateChangedAt: new Date().toISOString() }
                  : p,
              ),
            );
          }}
        />
      )}
    </Card>

  );
}

export default ApplicantPipeline;
