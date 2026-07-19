import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { errorResponse, json } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const entries = await prisma.memoryEntry.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        category: true,
        label: true,
        value: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return json({ entries });
  } catch (error) {
    return errorResponse(error);
  }
}
