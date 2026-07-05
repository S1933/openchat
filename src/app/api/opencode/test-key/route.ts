import { json, errorResponse } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";
import { listAllModels } from "@/lib/providers";
import { apiKeySchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await rateLimit("settings", userId);
    const { apiKey } = apiKeySchema.parse(await request.json());
    const models = await listAllModels(apiKey);
    return json({ ok: true, models: models.length });
  } catch (error) {
    return errorResponse(error);
  }
}
