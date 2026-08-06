import { z } from "zod";

import { getProvider } from "@/src/lib/providers";

/**
 * Validation for caller-supplied LLM credentials. Shared by /api/generate and
 * /api/test-connection so the two can never drift — they validate the same
 * secret-bearing payload.
 */
export const llmSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1).max(100),
    apiKey: z.string().min(1).max(500),
    baseUrl: z.string().url().max(300).optional(),
  })
  .refine((l) => Boolean(getProvider(l.provider)), {
    message: "Unknown provider",
    path: ["provider"],
  })
  .refine((l) => !getProvider(l.provider)?.needsBaseUrl || Boolean(l.baseUrl), {
    message: "A base URL is required for a custom provider",
    path: ["baseUrl"],
  });
