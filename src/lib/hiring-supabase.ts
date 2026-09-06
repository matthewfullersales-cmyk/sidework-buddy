// Data-access helpers for job postings.
// Postings are publicly readable; only the authenticated owner can mutate.
import { supabase } from "@/integrations/supabase/client";
import type { JobPosting, Role } from "@/lib/sidework-store";

type PostingRow = {
  id: string;
  owner_id: string;
  title: string;
  role: string;
  type: string;
  pay_range: string;
  description: string;
  posted_at: string;
  open: boolean;
};

export function postingFromRow(r: PostingRow): JobPosting {
  return {
    id: r.id,
    title: r.title,
    role: r.role as Role,
    type: r.type as JobPosting["type"],
    payRange: r.pay_range,
    description: r.description,
    postedAt: r.posted_at,
    open: r.open,
  };
}

/** Public: fetch a single job posting by id. */
export async function fetchPublicPosting(id: string): Promise<JobPosting | null> {
  const { data, error } = await supabase
    .from("job_postings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? postingFromRow(data as PostingRow) : null;
}

/** Owner-scoped: fetch all postings for a signed-in owner. */
export async function fetchOwnerPostings(ownerId: string): Promise<JobPosting[]> {
  const { data, error } = await supabase
    .from("job_postings")
    .select("*")
    .eq("owner_id", ownerId)
    .order("posted_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => postingFromRow(r as PostingRow));
}

export async function insertPosting(
  ownerId: string,
  data: { title: string; role: Role; type: JobPosting["type"]; payRange: string; description: string },
): Promise<JobPosting> {
  const { data: row, error } = await supabase
    .from("job_postings")
    .insert({
      owner_id: ownerId,
      title: data.title,
      role: data.role,
      type: data.type,
      pay_range: data.payRange,
      description: data.description,
      open: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return postingFromRow(row as PostingRow);
}

export async function updatePostingOpen(id: string, open: boolean): Promise<void> {
  const { error } = await supabase.from("job_postings").update({ open }).eq("id", id);
  if (error) throw error;
}

export async function deletePosting(id: string): Promise<void> {
  const { error } = await supabase.from("job_postings").delete().eq("id", id);
  if (error) throw error;
}
