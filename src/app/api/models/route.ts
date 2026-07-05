import { prisma } from "@/lib/prisma";
import { json, errorResponse } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const models = await prisma.modelCache.findMany({
      where: { userId, available: true },
      orderBy: [{ provider: "asc" }, { displayName: "asc" }]
    });
    return json({
      models: models.map((model) => ({
        id: `${model.provider}:${model.modelId}`,
        provider: model.provider,
        modelId: model.modelId,
        displayName: model.displayName,
        free: model.free,
        available: model.available,
        lastSync: model.lastSync
      }))
    });
  } catch (error) {
    return errorResponse(error);
  }
}
