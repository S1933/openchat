import { MessageRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { json, errorResponse } from "@/lib/http";
import { buildConversationContext, compactSummary, shouldRefreshSummary } from "@/lib/memory";
import { streamChat } from "@/lib/providers";
import { requireUserId } from "@/lib/session";
import { getSettings } from "@/lib/settings-cache";
import { chatSchema } from "@/lib/validation";
import { formatSearchContext, searchWeb } from "@/lib/search";
import { extractUrls, fetchUrlContent, formatUrlContext } from "@/lib/url";

// Module-level cache: decrypting the API key is a sync crypto op. The encrypted
// blob is the cache key; if it changes (settings POST), the cache miss naturally.
const apiKeyCache = new Map<string, string>();

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = chatSchema.parse(await request.json());

    // Kick off EVERYTHING in parallel: DB reads, userMessage insert, web search,
    // URL fetch — all gated on `body.message` and `body.conversationId` which we
    // already have from the parsed body. The only thing that has to wait is the
    // actual LLM stream, which needs the decrypted API key + the persisted user
    // message id (which we don't actually need — only its content/role).
    const firstUrl = extractUrls(body.message)[0];
    const [settings, conversation, userMessage, searchResult, urlDoc] = await Promise.all([
      getSettings(userId),
      prisma.conversation.findFirst({
        where: { id: body.conversationId, userId },
        select: {
          id: true,
          title: true,
          summary: true,
          messages: {
            orderBy: { createdAt: "asc" },
            take: 30
          }
        }
      }),
      prisma.message.create({
        data: {
          conversationId: body.conversationId,
          role: MessageRole.user,
          content: body.message,
          model: body.model,
          webSearch: body.webSearch ?? false
        }
      }),
      body.webSearch
        ? searchWeb(body.message, request.signal).catch((err) => {
            console.error("[chat] web search failed", err);
            return null;
          })
        : Promise.resolve(null),
      firstUrl
        ? fetchUrlContent(firstUrl, request.signal).catch((err) => {
            console.error("[chat] url fetch failed", { url: firstUrl, err });
            return null;
          })
        : Promise.resolve(null)
    ]);
    if (!settings?.apiKeyEncrypted) throw new Error("missing_api_key");
    if (!conversation) throw new Error("not_found");

    const cachedKey = apiKeyCache.get(settings.apiKeyEncrypted);
    const apiKey = cachedKey ?? (() => {
      const decrypted = decryptSecret(settings.apiKeyEncrypted!);
      apiKeyCache.set(settings!.apiKeyEncrypted!, decrypted);
      return decrypted;
    })();
    const contextBlocks: string[] = [];
    if (searchResult) contextBlocks.push(formatSearchContext(searchResult));
    if (urlDoc && firstUrl) contextBlocks.push(formatUrlContext(firstUrl, urlDoc));
    const extraContext = contextBlocks.length > 0 ? contextBlocks.join("\n\n") : undefined;
    const modelLabel = body.model;
    const context = buildConversationContext(conversation.summary, [...conversation.messages, userMessage], modelLabel, extraContext);
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
          // (D) Send `done` to the client immediately, then persist the assistant
          // message + conversation metadata in the background. This frees the
          // client from waiting on Prisma before the stream "completes".
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();

          void (async () => {
            try {
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
            } catch (err) {
              console.error("[chat] post-stream persist failed", err);
            }
          })();
        } catch (error) {
          if (assistantText) {
            // Fire-and-forget so the error event isn't blocked by a DB write
            void prisma.message.create({
              data: {
                conversationId: conversation.id,
                role: MessageRole.assistant,
                content: assistantText,
                model: body.model,
                status: request.signal.aborted ? "cancelled" : "error"
              }
            }).catch((err) => console.error("[chat] persist-on-error failed", err));
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
