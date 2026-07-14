const URL_RE = /\bhttps?:\/\/[^\s<>")']+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE);
  if (!matches) return [];
  return matches
    .map((u) => u.replace(/[.,;:!?)]+$/g, ""))
    .slice(0, 1); // first URL only (YAGNI)
}

type ExtractedDoc = { title: string; content: string };

export async function fetchUrlContent(url: string, signal?: AbortSignal): Promise<ExtractedDoc> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("missing_tavily_key");
  const res = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, urls: [url] }),
    cache: "no-store",
    signal
  });
  if (!res.ok) throw new Error(`tavily_${res.status}`);
  const data = (await res.json()) as { results?: Array<{ url: string; title?: string; raw_content?: string }> };
  const first = data.results?.[0];
  if (!first?.raw_content) throw new Error("tavily_empty");
  return { title: first.title ?? url, content: first.raw_content };
}

export function formatUrlContext(url: string, doc: ExtractedDoc): string {
  // Cap content to keep prompts sane (~12k chars ≈ 3-4k tokens).
  const content = doc.content.length > 12000 ? doc.content.slice(0, 12000) + "\n[…truncated]" : doc.content;
  return `Fetched content from ${url}\nTitle: ${doc.title}\n\n${content}`;
}
