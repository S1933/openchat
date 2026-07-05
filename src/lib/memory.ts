import type { Message } from "@prisma/client";
import type { ChatMessage } from "@/lib/providers";

const SYSTEM_PROMPT = `You are a conversational assistant in a chat app similar to ChatGPT.
You are chatting with a user, not building anything.
- Reply in the same language the user writes in.
- Be concise, direct, and natural. No boilerplate, no "I can help you with that".
- Never write code, files, or apps unless the user explicitly asks for code in the current message.
- Never suggest creating an app, a script, or a project. This is a chat, not a builder.
- Use markdown when it helps readability (lists, short code snippets when relevant).`;

export function buildConversationContext(summary: string | null, messages: Message[]): ChatMessage[] {
  const recent = messages.slice(-30).map((message) => ({
    role: message.role === "assistant" ? "assistant" : "user",
    content: message.content
  })) satisfies ChatMessage[];

  const base: ChatMessage = { role: "system", content: SYSTEM_PROMPT };
  if (!summary) return [base, ...recent];
  return [
    base,
    { role: "system", content: `Conversation summary for continuity:\n${summary}` },
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
