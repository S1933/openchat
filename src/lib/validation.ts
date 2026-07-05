import { z } from "zod";

export const apiKeySchema = z.object({
  apiKey: z.string().min(12),
  defaultModel: z.string().optional()
});

export const conversationCreateSchema = z.object({
  title: z.string().min(1).max(80).default("New chat"),
  selectedModel: z.string().optional()
});

export const conversationUpdateSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  selectedModel: z.string().min(1).optional(),
  archived: z.boolean().optional()
});

export const chatSchema = z.object({
  conversationId: z.string().min(1),
  model: z.string().min(1),
  message: z.string().min(1).max(20000)
});
