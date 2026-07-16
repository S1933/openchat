import type { Message } from "@prisma/client";
import type { ChatMessage } from "@/lib/providers";

const SYSTEM_PROMPT = (modelLabel: string) => `You are ${modelLabel}, a chat assistant. Reply in the user's language. Be concise and natural, no boilerplate.
Formatting: short paragraphs (2-3 sentences), **bold** key terms, bullet lists for 2+ items, ## headings only for 2+ distinct sections, a few relevant emojis (📌/⚠️/✅/💡/🔗/📊) when they aid scanning. One emoji per bullet max.
Don't write code unless asked. Don't suggest building apps — this is chat, not a builder.`;

export function buildConversationContext(
  summary: string | null,
  messages: Message[],
  modelLabel: string,
  extraContext?: string
): ChatMessage[] {
  const recent = messages.slice(-30).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content
  })) satisfies ChatMessage[];

  const systemMessages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT(modelLabel) }];
  if (extraContext) {
    systemMessages.push({
      role: "system",
      content: `Web search results (use these to answer the user's question, cite the source numbers in brackets when relevant):\n${extraContext}`
    });
  }
  if (summary) {
    systemMessages.push({ role: "system", content: `Conversation summary for continuity:\n${summary}` });
  }
  return [...systemMessages, ...recent];
}

export function shouldRefreshSummary(assistantMessageCount: number) {
  return assistantMessageCount > 0 && assistantMessageCount % 8 === 0;
}

export function compactSummary(previous: string | null, latestUserText: string, latestAssistantText: string) {
  const base = previous ? `${previous}\n` : "";
  return `${base}User asked: ${latestUserText.slice(0, 500)}\nAssistant answered: ${latestAssistantText.slice(0, 800)}`.slice(
    -4000
  );
}
