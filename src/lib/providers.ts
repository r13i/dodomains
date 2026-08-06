export const PROVIDER_IDS = [
  "google",
  "groq",
  "mistral",
  "openrouter",
  "openai",
  "anthropic",
  "deepseek",
  "xai",
  "custom",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderModel = {
  /** Exact model id sent to the provider. */
  id: string;
  /** USD per million input tokens. */
  in: number;
  /** USD per million output tokens. */
  out: number;
};

export type ProviderMeta = {
  id: ProviderId;
  label: string;
  /** Provider issues a usable free API key. */
  free: boolean;
  /** Expected key prefix, "" when the provider has no stable one. */
  keyPrefix: string;
  /** Host where a key is created, "" for custom. */
  keyHost: string;
  /** Namespaces model ids itself, so the seeded list is a hint only. */
  gateway: boolean;
  needsBaseUrl: boolean;
  models: ProviderModel[];
};

const m = (id: string, i: number, o: number): ProviderModel => ({
  id,
  in: i,
  out: o,
});

export const PROVIDERS: ProviderMeta[] = [
  {
    id: "google",
    label: "Google Gemini",
    free: true,
    keyPrefix: "AIza",
    keyHost: "aistudio.google.com",
    gateway: false,
    needsBaseUrl: false,
    models: [
      m("gemini-2.5-flash", 0.3, 2.5),
      m("gemini-2.5-flash-lite", 0.1, 0.4),
      m("gemini-3-flash-preview", 0.5, 3.0),
      m("gemini-3.1-flash-lite", 0.25, 1.5),
      m("gemini-2.5-pro", 1.25, 10.0),
      m("gemini-3.1-pro-preview", 2.0, 12.0),
    ],
  },
  {
    id: "groq",
    label: "Groq",
    free: true,
    keyPrefix: "gsk_",
    keyHost: "console.groq.com",
    gateway: true,
    needsBaseUrl: false,
    models: [
      m("llama-4-scout", 0.18, 0.59),
      m("llama-4-maverick", 0.27, 0.85),
      m("llama-3.3-70b", 0.59, 0.79),
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    free: true,
    keyPrefix: "",
    keyHost: "console.mistral.ai",
    gateway: false,
    needsBaseUrl: false,
    models: [
      m("mistral-small-2603", 0.15, 0.6),
      m("ministral-8b-2512", 0.15, 0.15),
      m("mistral-large-2512", 0.5, 1.5),
      m("mistral-medium-3-5", 1.5, 7.5),
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    free: true,
    keyPrefix: "sk-or-",
    keyHost: "openrouter.ai",
    gateway: true,
    needsBaseUrl: false,
    models: [
      m("deepseek/deepseek-chat", 0.14, 0.28),
      m("google/gemini-2.5-flash", 0.3, 2.5),
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    free: false,
    keyPrefix: "sk-",
    keyHost: "platform.openai.com",
    gateway: false,
    needsBaseUrl: false,
    models: [
      m("gpt-5-nano", 0.05, 0.4),
      m("gpt-4o-mini", 0.15, 0.6),
      m("gpt-5-mini", 0.25, 2.0),
      m("gpt-5.4-mini", 0.75, 4.5),
      m("gpt-5", 1.25, 10.0),
      m("gpt-4.1", 2.0, 8.0),
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    free: false,
    keyPrefix: "sk-ant-",
    keyHost: "console.anthropic.com",
    gateway: false,
    needsBaseUrl: false,
    models: [
      m("claude-sonnet-5", 2.0, 10.0),
      m("claude-haiku-4-5-20251001", 1.0, 5.0),
      m("claude-3-5-haiku-20241022", 0.8, 4.0),
      m("claude-opus-5", 5.0, 25.0),
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    free: false,
    keyPrefix: "sk-",
    keyHost: "platform.deepseek.com",
    gateway: false,
    needsBaseUrl: false,
    models: [
      m("deepseek-chat", 0.14, 0.28),
      m("deepseek-v4-flash", 0.14, 0.28),
      m("deepseek-v4-pro", 0.43, 0.87),
    ],
  },
  {
    id: "xai",
    label: "xAI Grok",
    free: false,
    keyPrefix: "xai-",
    keyHost: "console.x.ai",
    gateway: false,
    needsBaseUrl: false,
    models: [
      m("grok-code-fast-1", 0.2, 1.5),
      m("grok-4.3", 1.25, 2.5),
      m("grok-4.5", 2.0, 6.0),
    ],
  },
  {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    free: false,
    keyPrefix: "",
    keyHost: "",
    gateway: false,
    needsBaseUrl: true,
    models: [],
  },
];

export function getProvider(id: string): ProviderMeta | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** First seeded model for a provider, "" for custom. */
export function defaultModel(id: string): string {
  return getProvider(id)?.models[0]?.id ?? "";
}
