import { prisma } from "@/lib/prisma";
import { chatOnce, type ChatMessage } from "@/lib/providers";

// Cheap model used to extract user-profile facts off the critical path.
// user picks deepseek-v4-flash because it's the cheapest in the catalog.
const EXTRACTION_MODEL = "go:deepseek-v4-flash";

// Hard cap on entries injected into chat context (token economy).
export const MAX_ENTRIES_IN_CONTEXT = 50;

type Fact = {
  category: string;
  label: string;
  value: string;
};

// System prompt kept terse on purpose: cheap models get confused by long prompts.
const EXTRACTION_SYSTEM_PROMPT = `You analyze a short exchange between a user and an AI assistant. Extract persistent, useful facts about the user that should be remembered across FUTURE conversations.

Categories (pick the closest one):
- "profil"       — name, age, profession, location, language, identity
- "personnalité" — personality traits, communication style
- "habitudes"    — daily routines, recurring behaviors
- "préférences"  — likes, dislikes, opinions
- "contexte"     — ongoing projects, current life situation

Rules:
- Only facts likely relevant in FUTURE conversations.
- Skip one-time events ("I went to the movies yesterday").
- Each "label" must be SHORT and STABLE so it can serve as a unique key.
  Good: "Métier", "Langue principale", "Régime alimentaire"
  Bad: "Ce qu'il a fait samedi", "Sa dernière conversation"
- Do NOT repeat facts already in the KNOWN FACTS section.
- If no new facts, return [].
- Output ONLY a valid JSON array of OBJECTS with exactly these keys:
  {"category": one of profil|personnalité|habitudes|préférences|contexte,
   "label": "Short Stable Label",
   "value": "the fact itself"}
- Every array element MUST be an object (not a string).
- No markdown fences, no commentary, no prose before/after the JSON.`;

/**
 * Fire-and-forget extraction. Never throws. Logs errors with [memory] prefix.
 *
 * `transcript` is the user+assistant exchange that just finished. The chat
 * route calls this right after the stream completes.
 */
export async function extractMemory(args: {
  userId: string;
  conversationId: string;
  apiKey: string;
  transcript: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<void> {
  const { userId, conversationId, apiKey, transcript } = args;
  console.error("[memory] extractMemory called", {
    userId,
    conversationId,
    transcriptLen: transcript.length
  });
  try {
    if (transcript.length === 0) return;
    const userTurns = transcript.filter((m) => m.role === "user");
    if (userTurns.length === 0) return;

    // Fetch existing facts so the model can dedupe rather than re-emit them.
    const existing = await prisma.memoryEntry.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { category: true, label: true, value: true }
    });
    console.error("[memory] existing facts fetched", { count: existing.length });

    const messages: ChatMessage[] = [
      { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
      ...(existing.length > 0
        ? [
            {
              role: "user" as const,
              content:
                "KNOWN FACTS (do NOT re-extract these):\n" +
                existing
                  .map((f) => `- [${f.category}] ${f.label}: ${f.value}`)
                  .join("\n")
            }
          ]
        : []),
      // Persist "assistant" messages as part of the exchange — the model needs
      // its own words as anchors for personality/style facts.
      ...transcript.map((m) => ({ role: m.role, content: m.content }))
    ];

    const raw = await chatOnce({
      apiKey,
      model: EXTRACTION_MODEL,
      messages
    });
    console.error("[memory] chatOnce returned", { rawLen: raw.length, rawPreview: raw.slice(0, 120) });

    // Tolerate leading/trailing noise: pull out the first [...] we find.
    const jsonMatch = raw.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) return;
    let facts: unknown;
    try {
      facts = JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error("[memory] JSON parse failed", {
        raw: raw.slice(0, 200),
        err: err instanceof Error ? err.message : String(err)
      });
      return;
    }
    if (!Array.isArray(facts)) return;

    for (const raw of facts) {
      const fact = raw as Partial<Fact>;
      if (typeof fact.label !== "string" || typeof fact.value !== "string") continue;
      const label = fact.label.trim();
      const value = fact.value.trim();
      if (!label || !value) continue;
      const category =
        typeof fact.category === "string" && fact.category.trim()
          ? fact.category.trim()
          : "contexte";
      // Upsert by (userId, label) — guarantees one entry per stable label
      // and lets re-extraction refresh the value in place.
      await prisma.memoryEntry.upsert({
        where: { userId_label: { userId, label } },
        create: {
          userId,
          category,
          label,
          value,
          source: conversationId
        },
        update: { value, category }
      });
    }
  } catch (err) {
    console.error("[memory] extraction failed", {
      userId,
      err: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Format the user's stored facts as a context block for the chat system
 * prompt. Returns "" if there are no entries (the chat route skips pushing
 * empty blocks). Hard-capped at MAX_ENTRIES_IN_CONTEXT most-recent entries.
 */
export async function getMemoryContext(userId: string): Promise<string> {
  const entries = await prisma.memoryEntry.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_ENTRIES_IN_CONTEXT,
    select: { category: true, label: true, value: true }
  });
  if (entries.length === 0) return "";

  // Group by category, preserving updatedAt order within each group.
  const grouped = new Map<string, Array<{ label: string; value: string }>>();
  for (const e of entries) {
    if (!grouped.has(e.category)) grouped.set(e.category, []);
    grouped.get(e.category)!.push({ label: e.label, value: e.value });
  }

  const sections = Array.from(grouped.entries()).map(([category, items]) => {
    return `### ${category}\n` + items.map((i) => `- ${i.label}: ${i.value}`).join("\n");
  });

  return `## Mémoire utilisateur\n\n${sections.join("\n\n")}`;
}
