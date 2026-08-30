// Server functions for the in-app notification center + web push.
// All four employee-facing events (schedule published/changed, trade posted,
// time-off decision) go through here: they persist a row in employee_notifications
// (always) and, for opted-in employees with active push subscriptions, fan out
// a browser push. Twilio/SMS was fully removed.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Public VAPID key (server-side read; safe to return to client) ----------

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env.VAPID_PUBLIC_KEY ?? "" };
});

// ---------- Subscription management ----------

const subSchema = z.object({
  endpoint: z.string().url().max(2048),
  p256dh: z.string().min(1).max(512),
  auth: z.string().min(1).max(256),
  userAgent: z.string().max(400).optional(),
});

export const saveSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => subSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Resolve caller's employee row.
    const { data: emp, error: eErr } = await context.supabase
      .from("restaurant_employees")
      .select("id, owner_id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (eErr) throw eErr;
    if (!emp) throw new Error("No employee profile for this user");

    // Upsert by endpoint (unique).
    const { error } = await context.supabase
      .from("push_subscriptions")
      .upsert({
        owner_id: emp.owner_id,
        employee_id: emp.id,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        user_agent: data.userAgent ?? null,
        last_used_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
    if (error) throw error;

    // Flip opt-in flag on if not already.
    await context.supabase
      .from("restaurant_employees")
      .update({ push_opt_in: true })
      .eq("id", emp.id);

    return { ok: true };
  });

export const deleteSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ endpoint: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", data.endpoint);
    return { ok: true };
  });

export const setPushOptIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ optIn: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: emp } = await context.supabase
      .from("restaurant_employees")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!emp) throw new Error("No employee profile");
    await context.supabase
      .from("restaurant_employees")
      .update({ push_opt_in: data.optIn })
      .eq("id", emp.id);
    if (!data.optIn) {
      // Also clear stored subscriptions so the browser doesn't keep receiving.
      await context.supabase.from("push_subscriptions").delete().eq("employee_id", emp.id);
    }
    return { ok: true };
  });

// ---------- Notification fan-out ----------

type NotifKind = "schedule_published" | "schedule_changed" | "trade_posted" | "timeoff_resolved";

/** Insert notification rows + fan out push. Uses admin client so any authorized
 *  caller (owner or teammate) can create for the target employees regardless of
 *  cross-employee RLS nuances. Callers must authenticate via requireSupabaseAuth. */
async function fanOut(args: {
  ownerId: string;
  employeeIds: string[];
  kind: NotifKind;
  title: string;
  body: string;
  url?: string;
}) {
  if (args.employeeIds.length === 0) return { notifCount: 0, pushSent: 0 };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1) Persistent notification rows for the inbox (always).
  const rows = args.employeeIds.map((eid) => ({
    owner_id: args.ownerId,
    employee_id: eid,
    kind: args.kind,
    title: args.title,
    body: args.body,
    url: args.url ?? null,
  }));
  const { error: insErr } = await supabaseAdmin.from("employee_notifications").insert(rows);
  if (insErr) console.error("[fanOut insert]", insErr);

  // 2) Push, only to opted-in employees with active subscriptions.
  const { data: emps } = await supabaseAdmin
    .from("restaurant_employees")
    .select("id, push_opt_in")
    .in("id", args.employeeIds);
  const optedIds = (emps ?? []).filter((e) => e.push_opt_in).map((e) => e.id);
  if (optedIds.length === 0) return { notifCount: rows.length, pushSent: 0 };

  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("employee_id", optedIds);
  if (!subs || subs.length === 0) return { notifCount: rows.length, pushSent: 0 };

  try {
    const { sendPushToAll } = await import("@/lib/push.server");
    const { deadIds } = await sendPushToAll(subs, {
      title: args.title,
      body: args.body,
      url: args.url,
      tag: args.kind,
    });
    if (deadIds.length > 0) {
      await supabaseAdmin.from("push_subscriptions").delete().in("id", deadIds);
    }
    return { notifCount: rows.length, pushSent: subs.length - deadIds.length };
  } catch (e) {
    console.error("[fanOut push]", e);
    return { notifCount: rows.length, pushSent: 0 };
  }
}

async function authorizeOwnerContext(context: { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string }): Promise<{ ownerId: string }> {
  // Caller is owner, or an employee of an owner.
  const { data: prof } = await context.supabase
    .from("profiles")
    .select("id, role")
    .eq("id", context.userId)
    .maybeSingle();
  if (prof?.role === "owner") return { ownerId: prof.id };
  const { data: emp } = await context.supabase
    .from("restaurant_employees")
    .select("owner_id")
    .eq("auth_user_id", context.userId)
    .maybeSingle();
  if (emp?.owner_id) return { ownerId: emp.owner_id };
  throw new Error("Unauthorized");
}

export const notifyScheduleChanged = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employeeIds: z.array(z.string().uuid()).min(1).max(500),
    kind: z.enum(["published", "adjusted"]),
    weekLabel: z.string().max(120).optional().default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { ownerId } = await authorizeOwnerContext(context);
    const isPub = data.kind === "published";
    return fanOut({
      ownerId,
      employeeIds: data.employeeIds,
      kind: isPub ? "schedule_published" : "schedule_changed",
      title: isPub ? "New schedule posted" : "Your schedule was updated",
      body: data.weekLabel
        ? `${isPub ? "Schedule for" : "Changes to"} ${data.weekLabel} — tap to view your shifts.`
        : "Tap to view your shifts.",
      url: "/employee",
    });
  });

export const notifyTradePosted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employeeIds: z.array(z.string().uuid()).max(500),
    shiftLabel: z.string().max(160).default(""),
    role: z.string().max(80).default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.employeeIds.length === 0) return { notifCount: 0, pushSent: 0 };
    const { ownerId } = await authorizeOwnerContext(context);
    return fanOut({
      ownerId,
      employeeIds: data.employeeIds,
      kind: "trade_posted",
      title: "Open shift available",
      body: [data.role, data.shiftLabel].filter(Boolean).join(" · ") || "A teammate posted a shift to the trade board.",
      url: "/employee",
    });
  });

export const notifyTimeOffResolved = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    employeeId: z.string().uuid(),
    approved: z.boolean(),
    dateLabel: z.string().max(160).default(""),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { ownerId } = await authorizeOwnerContext(context);
    const title = data.approved ? "Time off approved" : "Time off declined";
    const parts = data.dateLabel ? `for ${data.dateLabel}` : "";
    return fanOut({
      ownerId,
      employeeIds: [data.employeeId],
      kind: "timeoff_resolved",
      title,
      body: parts || (data.approved ? "Your time off request was approved." : "Your time off request was declined."),
      url: "/employee",
    });
  });

// ---------- Inbox reads / mark-read (for the in-app center) ----------

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: emp } = await context.supabase
      .from("restaurant_employees")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!emp) return { items: [] };
    const { data } = await context.supabase
      .from("employee_notifications")
      .select("id, kind, title, body, url, created_at, read_at")
      .eq("employee_id", emp.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return { items: data ?? [] };
  });

export const markMyNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: emp } = await context.supabase
      .from("restaurant_employees")
      .select("id")
      .eq("auth_user_id", context.userId)
      .maybeSingle();
    if (!emp) return { ok: true };
    await context.supabase
      .from("employee_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("employee_id", emp.id)
      .is("read_at", null);
    return { ok: true };
  });
