import type { Message } from "@prisma/client";
import type { ChatMessage } from "@/lib/providers";

export function buildConversationContext(summary: string | null, messages: Message[]): ChatMessage[] {
  const recent = messages.slice(-30).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content
  })) satisfies ChatMessage[];

  if (!summary) return recent;
  return [
    {
      role: "system",
      content: `Conversation summary for continuity:\n${summary}`
    },
    ...recent
  ];
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
