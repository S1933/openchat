import { MessageRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { json, errorResponse } from "@/lib/http";
import { buildConversationContext, compactSummary, shouldRefreshSummary } from "@/lib/memory";
import { rateLimit } from "@/lib/rate-limit";
import { streamChat } from "@/lib/providers";
import { requireUserId } from "@/lib/session";
import { chatSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await rateLimit("chat", userId);
    const body = chatSchema.parse(await request.json());
    const [settings, conversation] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.conversation.findFirst({
        where: { id: body.conversationId, userId },
        include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } }
      })
    ]);
    if (!settings?.apiKeyEncrypted) throw new Error("missing_api_key");
    if (!conversation) throw new Error("not_found");

    const userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: MessageRole.user,
        content: body.message,
        model: body.model
      }
    });

    const context = buildConversationContext(conversation.summary, [...conversation.messages, userMessage]);
    const apiKey = decryptSecret(settings.apiKeyEncrypted);
    const encoder = new TextEncoder();
    let assistantText = "";
    let assistantThinking = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamChat({ apiKey, model: body.model, messages: context, signal: request.signal })) {
            if ("thinking" in chunk) {
              assistantThinking += chunk.thinking;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ thinking: chunk.thinking })}\n\n`));
            } else if ("token" in chunk) {
              assistantText += chunk.token;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk.token })}\n\n`));
            }
          }
          const assistant = await prisma.message.create({
            data: {
              conversationId: conversation.id,
              role: MessageRole.assistant,
              content: assistantText,
              model: body.model,
              status: "complete"
            }
          });
          const assistantCount = await prisma.message.count({
            where: { conversationId: conversation.id, role: MessageRole.assistant }
          });
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              selectedModel: body.model,
              title: conversation.title === "New chat" ? body.message.slice(0, 60) : conversation.title,
              summary: shouldRefreshSummary(assistantCount)
                ? compactSummary(conversation.summary, body.message, assistant.content)
                : conversation.summary
            }
          });
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        } catch (error) {
          if (assistantText) {
            await prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: MessageRole.assistant,
                content: assistantText,
                model: body.model,
                status: request.signal.aborted ? "cancelled" : "error"
              }
            });
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : "server_error" })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}
