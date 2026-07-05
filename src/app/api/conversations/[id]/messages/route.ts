import { prisma } from "@/lib/prisma";
import { json, errorResponse } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
    if (!conversation) throw new Error("not_found");
    const cursor = new URL(request.url).searchParams.get("cursor");
    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: "asc" },
      take: 60,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    return json({ messages, nextCursor: messages.at(-1)?.id ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}
