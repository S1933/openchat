import { MessageRole, MessageStatus, type Message } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildConversationContext, compactSummary, shouldRefreshSummary } from "@/lib/memory";

function message(id: string, role: MessageRole, content: string): Message {
  return {
    id,
    conversationId: "c1",
    role,
    content,
    model: null,
    promptTokens: null,
    completionTokens: null,
    status: MessageStatus.complete,
    createdAt: new Date()
  };
}

describe("conversation memory", () => {
  it("prepends summary and keeps recent messages", () => {
    const messages = Array.from({ length: 35 }, (_, index) =>
      message(String(index), index % 2 ? MessageRole.assistant : MessageRole.user, `m${index}`)
    );
    const context = buildConversationContext("stored facts", messages);
    expect(context[0]).toEqual({
      role: "system",
      content: "Conversation summary for continuity:\nstored facts"
    });
    expect(context).toHaveLength(31);
    expect(context[1].content).toBe("m5");
  });

  it("refreshes summary every eight assistant messages", () => {
    expect(shouldRefreshSummary(7)).toBe(false);
    expect(shouldRefreshSummary(8)).toBe(true);
  });

  it("compacts summary to a bounded string", () => {
    const summary = compactSummary("old", "u".repeat(1000), "a".repeat(2000));
    expect(summary.length).toBeLessThanOrEqual(4000);
    expect(summary).toContain("User asked:");
  });
});
