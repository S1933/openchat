import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await context.params;
    // Verify ownership before delete — never trust the client.
    const existing = await prisma.memoryEntry.findUnique({
      where: { id },
      select: { userId: true }
    });
    if (!existing || existing.userId !== userId) {
      return new NextResponse("Not found", { status: 404 });
    }
    await prisma.memoryEntry.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
