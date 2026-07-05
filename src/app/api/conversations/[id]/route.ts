import { prisma } from "@/lib/prisma";
import { json, errorResponse } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { conversationUpdateSchema } from "@/lib/validation";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    const body = conversationUpdateSchema.parse(await request.json());
    await assertOwner(userId, id);
    const conversation = await prisma.conversation.update({
      where: { id },
      data: body
    });
    return json({ conversation });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await params;
    await assertOwner(userId, id);
    await prisma.conversation.update({
      where: { id },
      data: { archived: true }
    });
    return json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

async function assertOwner(userId: string, id: string) {
  const conversation = await prisma.conversation.findFirst({ where: { id, userId } });
  if (!conversation) throw new Error("not_found");
}
