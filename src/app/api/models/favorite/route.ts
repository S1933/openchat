import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { json, errorResponse } from "@/lib/http";
import { requireUserId } from "@/lib/session";

const favoriteSchema = z.object({
  modelId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const { modelId } = favoriteSchema.parse(await request.json());
    const [provider, ...rest] = modelId.split(":");
    const id = rest.join(":");
    if (!provider || !id) throw new Error("invalid_model_id");
    const existing = await prisma.modelCache.findUnique({
      where: { userId_provider_modelId: { userId, provider, modelId: id } },
      select: { favorite: true }
    });
    if (!existing) throw new Error("not_found");
    const favorite = !existing.favorite;
    await prisma.modelCache.update({
      where: { userId_provider_modelId: { userId, provider, modelId: id } },
      data: { favorite }
    });
    return json({ modelId, favorite });
  } catch (error) {
    return errorResponse(error);
  }
}
