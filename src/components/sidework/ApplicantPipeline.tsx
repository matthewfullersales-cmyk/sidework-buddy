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
import { PersonAvatar } from "@/components/sidework/PersonAvatar";
import { InterviewOfferDialog } from "@/components/sidework/InterviewOfferDialog";
import { formatPhone } from "@/lib/format-phone";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchInterviewsForPeople,
  cancelInterview,
  type Interview,
} from "@/lib/interviews-supabase";
import {
  fetchPeople,
  setPersonState,
  archivePerson,
  type Person,
  type PersonState,
} from "@/lib/people-supabase";


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

function longDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ApplicantPipeline() {
  const { effectiveOwner } = useAuth();
  const ownerId = effectiveOwner?.ownerId ?? null;

  const [people, setPeople] = useState<Person[]>([]);
  const [jobTitles, setJobTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (oid: string) => {
    setLoading(true);
    try {
      const rows = await fetchPeople(oid, { archived: showArchived ? undefined : false });
      setPeople(rows);
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
        .select("id, title")
        .eq("owner_id", ownerId);
      const map: Record<string, string> = {};
      for (const j of (data ?? []) as { id: string; title: string }[]) map[j.id] = j.title;
      setJobTitles(map);
    })();
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
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                            {next && (
                              <Button size="sm" disabled={busy} onClick={() => void move(p, next)}>
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
                  Applicant since {longDate(openPerson.appliedAt ?? openPerson.createdAt)} · in {STATE_LABEL[openPerson.state]} since {longDate(openPerson.stateChangedAt)}
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
              </div>

              <DialogFooter className="flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button size="sm" disabled={busy || openPerson.state === "interviewing"} onClick={() => void move(openPerson, "interviewing")}>Move to Interviewing</Button>
                <Button size="sm" disabled={busy || openPerson.state === "shadow"} onClick={() => void move(openPerson, "shadow")}>Move to Shadow</Button>
                <Button size="sm" disabled={busy || openPerson.state === "hired"} onClick={() => void move(openPerson, "hired")}>Hire</Button>
                <Button size="sm" variant="outline" disabled={busy || openPerson.state === "rejected"} onClick={() => void move(openPerson, "rejected")}>Pass</Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void archive(openPerson)}>
                  {openPerson.archived ? "Restore" : "Archive"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export default ApplicantPipeline;
