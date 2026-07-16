// Module-level TTL cache for UserSettings. Cuts 1 DB round-trip per `/api/chat`
// on the warm path. Single-user app → very high hit rate. TTL is short enough
// that a settings POST (API key change, default model change) only causes at
// most 30s of stale reads. POST /api/settings explicitly invalidates the entry.

import { prisma } from "@/lib/prisma";

type Cached = {
  settings: { apiKeyEncrypted: string | null; defaultModel: string | null } | null;
  expires: number;
};

const TTL_MS = 30_000;
const cache = new Map<string, Cached>();

export async function getSettings(userId: string) {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expires > now) return hit.settings;

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { apiKeyEncrypted: true, defaultModel: true }
  });
  cache.set(userId, { settings: settings ?? null, expires: now + TTL_MS });
  return settings ?? null;
}

export function invalidateSettings(userId: string) {
  cache.delete(userId);
}
