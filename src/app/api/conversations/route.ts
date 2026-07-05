import { prisma } from "@/lib/prisma";
import { json, errorResponse } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { conversationCreateSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const cursor = new URL(request.url).searchParams.get("cursor");
    const conversations = await prisma.conversation.findMany({
      where: { userId, archived: false },
      orderBy: { updatedAt: "desc" },
      take: 25,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {})
    });
    return json({ conversations, nextCursor: conversations.at(-1)?.id ?? null });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = conversationCreateSchema.parse(await request.json());
    const conversation = await prisma.conversation.create({
      data: { userId, title: body.title, selectedModel: body.selectedModel }
    });
    return json({ conversation }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
