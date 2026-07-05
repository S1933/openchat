export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ProviderModel = {
  provider: "zen" | "go";
  modelId: string;
  displayName: string;
  free: boolean;
  available: boolean;
};

type ProviderName = ProviderModel["provider"];

const providers: Record<ProviderName, { label: string; baseUrl?: string }> = {
  zen: { label: "OpenCode Zen", baseUrl: process.env.OPENCODE_ZEN_BASE_URL },
  go: { label: "OpenCode Go", baseUrl: process.env.OPENCODE_GO_BASE_URL }
};

function providerFromModel(model: string): { provider: ProviderName; modelId: string } {
  const [provider, ...rest] = model.split(":");
  if ((provider !== "zen" && provider !== "go") || rest.length === 0) {
    throw new Error("Invalid model id");
  }
  return { provider, modelId: rest.join(":") };
}

function baseUrl(provider: ProviderName) {
  const url = providers[provider].baseUrl;
  if (!url) throw new Error(`${provider} base URL is not configured`);
  return url.replace(/\/$/, "");
}

export async function listProviderModels(provider: ProviderName, apiKey: string) {
  const res = await fetch(`${baseUrl(provider)}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store"
  });
  if (res.status === 401 || res.status === 403) throw new Error("invalid_key");
  if (!res.ok) throw new Error("provider_unavailable");
  const data = (await res.json()) as { data?: Array<{ id: string; name?: string }> };
  return (data.data ?? []).map((model) => ({
    provider,
    modelId: model.id,
    displayName: model.name ?? model.id,
    free: /free/i.test(model.id),
    available: true
  }));
}

export async function listAllModels(apiKey: string) {
  const results = await Promise.allSettled(
    (Object.keys(providers) as ProviderName[]).map((provider) => listProviderModels(provider, apiKey))
  );
  const models = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
  if (models.length === 0) {
    const invalid = results.some((result) => result.status === "rejected" && result.reason?.message === "invalid_key");
    throw new Error(invalid ? "invalid_key" : "provider_unavailable");
  }
  return models;
}

export async function* streamChat({
  apiKey,
  model,
  messages,
  signal
}: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}) {
  const { provider, modelId } = providerFromModel(model);
  const res = await fetch(`${baseUrl(provider)}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: modelId, messages, stream: true }),
    signal
  });

  if (res.status === 401 || res.status === 403) throw new Error("invalid_key");
  if (res.status === 429) throw new Error("rate_limit");
  if (!res.ok || !res.body) throw new Error("provider_unavailable");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
      const token = json.choices?.[0]?.delta?.content;
      if (token) yield token;
    }
  }
}
