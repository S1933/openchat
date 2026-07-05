import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN
      })
    : null;

const limiters = redis
  ? {
      chat: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(30, "1 m") }),
      settings: new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 m") })
    }
  : null;

export async function rateLimit(kind: keyof NonNullable<typeof limiters>, key: string) {
  if (!limiters) return;
  const result = await limiters[kind].limit(key);
  if (!result.success) throw new Response("Rate limit exceeded", { status: 429 });
}
