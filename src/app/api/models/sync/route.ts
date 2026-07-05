import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto";
import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";
import { listAllModels } from "@/lib/providers";

export async function POST() {
  try {
    const userId = await requireUserId();
    await rateLimit("settings", userId);
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings?.apiKeyEncrypted) throw new Error("missing_api_key");
    const models = await listAllModels(decryptSecret(settings.apiKeyEncrypted));
    await prisma.$transaction(
      models.map((model) =>
        prisma.modelCache.upsert({
          where: {
            userId_provider_modelId: {
              userId,
              provider: model.provider,
              modelId: model.modelId
            }
          },
          create: {
            userId,
            provider: model.provider,
            modelId: model.modelId,
            displayName: model.displayName,
            free: model.free,
            available: true
          },
          update: {
            displayName: model.displayName,
            free: model.free,
            available: true,
            lastSync: new Date()
          }
        })
      )
    );
    return json({ ok: true, count: models.length });
  } catch (error) {
    return errorResponse(error);
  }
}
