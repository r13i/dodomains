import { createAnthropic } from "@ai-sdk/anthropic";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createXai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV4 } from "@ai-sdk/provider";

import { getProvider, type ProviderId } from "@/src/lib/providers";

export type LlmCredentials = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

type Factory = (c: LlmCredentials) => LanguageModelV4;

export const FACTORIES: Record<ProviderId, Factory> = {
  // `createOpenAI(...)(id)` targets the Responses API. `.chat()` is Chat
  // Completions, which every OpenAI account tier can reach.
  openai: ({ apiKey, model }) => createOpenAI({ apiKey }).chat(model),
  anthropic: ({ apiKey, model }) => createAnthropic({ apiKey })(model),
  google: ({ apiKey, model }) => createGoogle({ apiKey })(model),
  mistral: ({ apiKey, model }) => createMistral({ apiKey })(model),
  groq: ({ apiKey, model }) => createGroq({ apiKey })(model),
  deepseek: ({ apiKey, model }) => createDeepSeek({ apiKey })(model),
  xai: ({ apiKey, model }) => createXai({ apiKey })(model),
  openrouter: ({ apiKey, model }) => createOpenRouter({ apiKey })(model),
  custom: ({ apiKey, model, baseUrl }) => {
    if (!baseUrl)
      throw new Error("A base URL is required for a custom provider");
    return createOpenAICompatible({ name: "custom", baseURL: baseUrl, apiKey })(
      model,
    );
  },
};

export function resolveModel(c: LlmCredentials): LanguageModelV4 {
  const meta = getProvider(c.provider);
  if (!meta) throw new Error(`Unknown provider: ${c.provider}`);
  return FACTORIES[meta.id](c);
}
