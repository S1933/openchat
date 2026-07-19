export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ProviderModel = {
  provider: string;
  modelId: string;
  displayName: string;
  free: boolean;
  available: boolean;
};

function providerFromModel(model: string): { provider: string; modelId: string } {
  const parts = model.split(":");
  const invalid = parts.length < 2 || !parts[0] || !parts[1];
  if (invalid) throw new Error("Invalid model id");
  return { provider: parts[0], modelId: parts.slice(1).join(":") };
}

function baseUrl(provider: string) {
  const key = `PROVIDER_${provider.toUpperCase()}_BASE_URL`;
  const url = process.env[key];
  if (!url) throw new Error(`${provider} base URL is not configured`);
  return url.replace(/\/$/, "");
}

export async function listProviderModels(provider: string, apiKey: string) {
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
  const url = `${baseUrl(provider)}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: modelId, messages, stream: true }),
    signal
  });
  console.error("[streamChat]", { url, model: modelId, keyPrefix: apiKey.slice(0, 10), status: res.status });

  if (res.status === 401 || res.status === 403) throw new Error("invalid_key");
  if (res.status === 429) throw new Error("rate_limit");
  if (!res.ok || !res.body) {
    // Log the upstream's response body so 5xx errors are diagnosable
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    console.error("[streamChat] upstream error body", body.slice(0, 500));
    throw new Error("provider_unavailable");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstModel = true;

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
      const json = JSON.parse(payload) as {
        model?: string;
        choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
      };
      if (firstModel && json.model) {
        console.error("[streamChat] response model", { requested: modelId, served: json.model });
        firstModel = false;
      }
      const delta = json.choices?.[0]?.delta;
      const thinking = delta?.reasoning_content;
      const token = delta?.content;
      if (thinking) yield { thinking };
      if (token) yield { token };
    }
  }
}

export async function chatOnce({
  apiKey,
  model,
  messages,
  signal
}: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
}): Promise<string> {
  const { provider, modelId } = providerFromModel(model);
  const url = `${baseUrl(provider)}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ model: modelId, messages, stream: false }),
    signal
  });
  if (res.status === 401 || res.status === 403) throw new Error("invalid_key");
  if (res.status === 429) throw new Error("rate_limit");
  if (!res.ok) throw new Error("provider_unavailable");
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data.choices?.[0]?.message?.content ?? "";
}
