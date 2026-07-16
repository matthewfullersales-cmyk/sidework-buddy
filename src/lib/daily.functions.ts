import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DAILY_API = "https://api.daily.co/v1";

async function dailyFetch(path: string, init?: RequestInit) {
  const key = process.env.DAILY_API_KEY;
  if (!key) throw new Error("DAILY_API_KEY not configured");
  return fetch(`${DAILY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export const getOrCreateInterviewRoom = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ applicationId: z.string().min(1).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    // Daily room names: lowercase letters, numbers, dashes/underscores.
    const safeId = data.applicationId.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    const name = `sw-${safeId}`.slice(0, 41);

    // Fresh 2-hour expiry each time this is called; extend or recreate as needed.
    const expSeconds = Math.floor(Date.now() / 1000) + 60 * 60 * 2;

    // Try to fetch existing room first.
    const existing = await dailyFetch(`/rooms/${name}`);
    if (existing.ok) {
      const json = (await existing.json()) as {
        url: string;
        name: string;
        config?: { exp?: number };
      };
      const currentExp = json.config?.exp ?? 0;
      const nowSec = Math.floor(Date.now() / 1000);
      // If the room is expired or has < 30 min left, extend it so the
      // hosted Daily page doesn't show "meeting has expired".
      if (currentExp - nowSec < 60 * 30) {
        const patched = await dailyFetch(`/rooms/${name}`, {
          method: "POST",
          body: JSON.stringify({ properties: { exp: expSeconds } }),
        });
        if (!patched.ok) {
          const text = await patched.text();
          throw new Error(
            `Failed to extend Daily room (${patched.status}): ${text}`,
          );
        }
      }
      return { url: json.url, name: json.name };
    }

    const res = await dailyFetch(`/rooms`, {
      method: "POST",
      body: JSON.stringify({
        name,
        privacy: "public",
        properties: {
          exp: expSeconds,
          enable_prejoin_ui: true,
          enable_screenshare: true,
          enable_chat: true,
          start_video_off: false,
          start_audio_off: false,
        },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to create Daily room (${res.status}): ${text}`);
    }
    const json = (await res.json()) as { url: string; name: string };
    return { url: json.url, name: json.name };
  });
