import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";
import { apiKeySchema } from "@/lib/validation";

export async function GET() {
  try {
    const userId = await requireUserId();
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    return json({
      hasApiKey: Boolean(settings?.apiKeyEncrypted),
      defaultModel: settings?.defaultModel ?? null,
      theme: settings?.theme ?? "system"
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await rateLimit("settings", userId);
    const body = apiKeySchema.parse(await request.json());
    const settings = await prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        apiKeyEncrypted: encryptSecret(body.apiKey),
        defaultModel: body.defaultModel
      },
      update: {
        apiKeyEncrypted: encryptSecret(body.apiKey),
        defaultModel: body.defaultModel
      }
    });
    return json({
      hasApiKey: Boolean(decryptSecret(settings.apiKeyEncrypted ?? "")),
      defaultModel: settings.defaultModel
    });
  } catch (error) {
    return errorResponse(error);
  }
}
