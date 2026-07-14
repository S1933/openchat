import { describe, it, expect, afterEach } from "vitest";
import { extractUrls, fetchUrlContent, formatUrlContext } from "./url";

describe("extractUrls", () => {
  it("returns [] for a message with no URL", () => {
    expect(extractUrls("hello world")).toEqual([]);
  });
  it("extracts a single http URL", () => {
    expect(extractUrls("check http://example.com please")).toEqual(["http://example.com"]);
  });
  it("extracts a single https URL", () => {
    expect(extractUrls("analyse https://example.com/foo?bar=1")).toEqual(["https://example.com/foo?bar=1"]);
  });
  it("extracts only the first URL when multiple are present", () => {
    expect(extractUrls("a https://a.com b https://b.com")).toEqual(["https://a.com"]);
  });
  it("ignores non-URL text containing dots", () => {
    expect(extractUrls("version 1.2.3 release")).toEqual([]);
  });
  it("strips trailing punctuation", () => {
    expect(extractUrls("see https://example.com.")).toEqual(["https://example.com"]);
  });
});

describe("fetchUrlContent", () => {
  // Snapshot the real fetch once so every test in this describe block
  // gets a guaranteed restore in afterEach — no mock can leak across tests.
  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns title + raw_content on success", async () => {
    // Capture call args into locals; assertions live OUTSIDE the mock so a
    // failed assertion surfaces the real call site (not the fetch internals)
    // and the mock can't short-circuit the main r === ... assertion.
    const captured: { method?: string; apiKey?: string; urls?: unknown } = {};
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      captured.method = init.method;
      const body = JSON.parse(init.body as string) as { api_key?: string; urls?: unknown };
      captured.apiKey = body.api_key;
      captured.urls = body.urls;
      return new Response(JSON.stringify({
        results: [{ url: "https://example.com", title: "Example", raw_content: "Hello world." }]
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;
    process.env.TAVILY_API_KEY = "test-key";
    const r = await fetchUrlContent("https://example.com");
    expect(captured.method).toBe("POST");
    expect(captured.apiKey).toBe("test-key");
    expect(captured.urls).toEqual(["https://example.com"]);
    expect(r).toEqual({ title: "Example", content: "Hello world." });
  });

  it("throws when TAVILY_API_KEY is missing", async () => {
    delete process.env.TAVILY_API_KEY;
    await expect(fetchUrlContent("https://example.com")).rejects.toThrow("missing_tavily_key");
  });

  it("throws on non-2xx", async () => {
    process.env.TAVILY_API_KEY = "k";
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(fetchUrlContent("https://x")).rejects.toThrow("tavily_500");
  });

  it("throws tavily_empty when results array is empty", async () => {
    process.env.TAVILY_API_KEY = "k";
    globalThis.fetch = (async () => new Response(
      JSON.stringify({ results: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as unknown as typeof fetch;
    await expect(fetchUrlContent("https://x")).rejects.toThrow("tavily_empty");
  });
});

describe("formatUrlContext", () => {
  it("formats title and content with the URL header", () => {
    const out = formatUrlContext("https://example.com", { title: "T", content: "body" });
    expect(out).toContain("Fetched content from https://example.com");
    expect(out).toContain("Title: T");
    expect(out).toContain("body");
  });
  it("truncates content over 12000 chars with a [truncated] marker", () => {
    const big = "x".repeat(12050);
    const out = formatUrlContext("https://x", { title: "T", content: big });
    expect(out).toContain("[…truncated]");
    // Strict: the leading 12000 chars are preserved, and the full 12050-char
    // run is NOT present (proves at least the trailing 50 chars were dropped).
    expect(out).toContain("x".repeat(12000));
    expect(out).not.toContain(big);
  });
});
