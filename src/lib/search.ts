type TavilyResult = {
  title: string;
  url: string;
  content: string;
};

type TavilyResponse = {
  answer?: string;
  results?: TavilyResult[];
};

export type WebSearchResult = {
  answer: string | null;
  sources: TavilyResult[];
};

export async function searchWeb(query: string, signal?: AbortSignal): Promise<WebSearchResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("missing_tavily_key");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: 5,
      include_answer: true,
      search_depth: "basic"
    }),
    cache: "no-store",
    signal
  });
  if (!res.ok) throw new Error(`tavily_${res.status}`);
  const data = (await res.json()) as TavilyResponse;
  return {
    answer: data.answer?.trim() || null,
    sources: (data.results ?? []).slice(0, 5)
  };
}

export function formatSearchContext(result: WebSearchResult): string {
  const parts: string[] = [];
  if (result.answer) parts.push(`Direct answer from the web: ${result.answer}`);
  if (result.sources.length > 0) {
    parts.push(
      "Sources:\n" +
        result.sources
          .map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${source.content}`)
          .join("\n\n")
    );
  }
  return parts.length > 0 ? parts.join("\n\n") : "No web results.";
}
