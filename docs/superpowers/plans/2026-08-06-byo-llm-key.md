# BYO LLM Key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the operator-owned OpenAI call in `/api/generate` with a visitor-supplied API key that works against nine providers.

**Architecture:** A two-file provider registry splits browser-safe metadata from server-only SDK factories. The route handler becomes thin glue over four focused modules: registry, error mapper, generator, availability checker. The key travels in the request body, is used in memory, and is never persisted or logged server-side.

**Tech Stack:** Next.js 15 App Router, React 19, Vercel AI SDK v7, zod 3.25, Postgres via `pg`, Vitest 4, Tailwind 4 + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-08-06-byo-llm-key-design.md`
**Mockup:** `docs/superpowers/specs/assets/2026-08-06-byo-key-mockup.html`

## Global Constraints

These apply to every task. Do not restate them per task; do not violate them.

- **Never log, persist, or echo `apiKey`.** Not in `console.log`, not in an error message, not in a response body. Destructure it straight into the factory.
- **Do not change the visual style.** Use only the tokens already in `src/app/globals.css` and the existing shadcn components in `src/components/ui/`. No new colors, no new fonts, no new layout language. Match the surrounding code's idiom.
- **`ai@^7.0.55`, `@ai-sdk/*@^4` / `@ai-sdk/deepseek@^3` / `@ai-sdk/openai-compatible@^3` / `@openrouter/ai-sdk-provider@^3`.**
- **`zod@^3.25.76` minimum** — `ai@7` peer-requires `^3.25.76 || ^4.1.8`. Stay on zod 3.
- **Node >= 22.** `ai@7` is ESM-only and declares `engines.node >= 22`.
- **Use `instructions`, not `system`** — `system` is deprecated in v7.
- **Use `generateText` with `Output.object`, not `generateObject`** — the latter is deprecated in v7. The parsed value is on `.output`, not `.object`.
- **Error type guards are `X.isInstance(err)`, never `instanceof`** — they are symbol-based and survive duplicate package copies.
- **Path alias is `@/src/*`** (see `tsconfig.json:22`). Import as `@/src/lib/...`.
- **Do not add `msw`.** It was required by `ai/test` in v5. It is not in v7.
- **Prettier is in use.** Run `npx prettier --write` on touched files before committing.

---

### Task 1: Toolchain — dependencies, zod bump, Vitest

**Files:**

- Modify: `package.json`
- Create: `vitest.config.mts`
- Create: `src/lib/utils.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: a working `npm test`. Every later task depends on it.

- [ ] **Step 1: Install the runtime dependencies**

```bash
npm install ai@^7.0.55 \
  @ai-sdk/openai@^4 @ai-sdk/anthropic@^4 @ai-sdk/google@^4 \
  @ai-sdk/mistral@^4 @ai-sdk/groq@^4 @ai-sdk/xai@^4 \
  @ai-sdk/deepseek@^3 @ai-sdk/openai-compatible@^3 \
  @openrouter/ai-sdk-provider@^3 \
  zod@^3.25.76
```

`zod` is already a dependency at `^3.24.2`; this bumps it. `ai@7` peer-requires `^3.25.76` and npm will warn loudly if you skip it.

- [ ] **Step 2: Install the dev dependencies**

```bash
npm install -D vitest@^4.1.10 @ai-sdk/provider@^4 @types/node@^24
```

`@ai-sdk/provider` is a transitive dependency of `ai`, but Task 3 imports `LanguageModelV4` from it directly, so declare it.

- [ ] **Step 3: Add the test scripts and the Node engine floor**

In `package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

And add a top-level `"engines"` block:

```json
"engines": { "node": ">=22" }
```

- [ ] **Step 4: Create the Vitest config**

Create `vitest.config.mts`. The extension must be `.mts` — `package.json` has no `"type": "module"`, so a `.ts` config is loaded as CommonJS and Vite emits a config-loader warning.

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    tsconfigPaths: true,
  },
});
```

`resolve.tsconfigPaths` is native in the Vite 8 that Vitest 4 bundles. It reads `paths` from `tsconfig.json` directly. Do not install `vite-tsconfig-paths`.

- [ ] **Step 5: Write a failing smoke test**

Create `src/lib/utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cn } from "@/src/lib/utils";

describe("cn", () => {
  it("lets a later tailwind class win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
```

- [ ] **Step 6: Run it**

Run: `npm test`
Expected: PASS, 1 test. This proves the alias resolves and the node environment works.

- [ ] **Step 7: Commit**

```bash
npx prettier --write package.json vitest.config.mts src/lib/utils.test.ts
git add package.json package-lock.json vitest.config.mts src/lib/utils.test.ts
git commit -m "chore: add AI SDK v7, bump zod, set up vitest"
```

---

### Task 2: Provider metadata registry

**Files:**

- Create: `src/lib/providers.ts`
- Test: `src/lib/providers.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type ProviderId` — union of the nine ids
  - `type ProviderModel = { id: string; in: number; out: number }`
  - `type ProviderMeta` — see Step 3
  - `const PROVIDERS: ProviderMeta[]` — display order, free providers first
  - `function getProvider(id: string): ProviderMeta | undefined`
  - `function defaultModel(id: string): string` — first seeded model, `""` for custom
  - `const PROVIDER_IDS: readonly ProviderId[]`

**This file must not import any `@ai-sdk/*` package.** It is imported by the browser bundle. Task 3 holds the SDK imports.

- [ ] **Step 1: Write the failing test**

Create `src/lib/providers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_IDS, getProvider } from "@/src/lib/providers";

describe("provider registry", () => {
  it("has nine providers", () => {
    expect(PROVIDERS).toHaveLength(9);
  });

  it("lists every free provider before every paid one", () => {
    const firstPaid = PROVIDERS.findIndex((p) => !p.free);
    const lastFree = PROVIDERS.map((p) => p.free).lastIndexOf(true);
    expect(lastFree).toBeLessThan(firstPaid);
  });

  it("has unique ids that match PROVIDER_IDS", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it("gives every non-custom provider at least one seeded model", () => {
    for (const p of PROVIDERS) {
      if (p.id === "custom") continue;
      expect(p.models.length, `${p.id} has no models`).toBeGreaterThan(0);
    }
  });

  it("has no empty model ids and no negative prices", () => {
    for (const p of PROVIDERS) {
      for (const m of p.models) {
        expect(m.id.trim(), `${p.id} model id`).not.toBe("");
        expect(m.in).toBeGreaterThanOrEqual(0);
        expect(m.out).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("requires a base URL only for custom", () => {
    for (const p of PROVIDERS) {
      expect(p.needsBaseUrl).toBe(p.id === "custom");
    }
  });

  it("resolves a known id and rejects an unknown one", () => {
    expect(getProvider("openai")?.label).toBe("OpenAI");
    expect(getProvider("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- providers`
Expected: FAIL — `Failed to resolve import "@/src/lib/providers"`.

- [ ] **Step 3: Write the registry**

Create `src/lib/providers.ts`. Model ids and prices are from https://hail.so/costs.md (USD per million tokens, input / output).

```ts
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
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- providers`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/providers.ts src/lib/providers.test.ts
git add src/lib/providers.ts src/lib/providers.test.ts
git commit -m "feat: add browser-safe LLM provider registry"
```

---

### Task 3: Server-only provider factories

**Files:**

- Create: `src/lib/providers.server.ts`
- Test: `src/lib/providers.server.test.ts`

**Interfaces:**

- Consumes: `ProviderId`, `PROVIDER_IDS`, `getProvider` from `@/src/lib/providers`.
- Produces:
  - `type LlmCredentials = { provider: string; model: string; apiKey: string; baseUrl?: string }`
  - `function resolveModel(c: LlmCredentials): LanguageModelV4` — throws `Error` on unknown provider or missing base URL.

- [ ] **Step 1: Write the failing test**

Create `src/lib/providers.server.test.ts`. These assert wiring, not network calls — no key is ever valid here because nothing is sent.

```ts
import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "@/src/lib/providers";
import { FACTORIES, resolveModel } from "@/src/lib/providers.server";

describe("provider factories", () => {
  it("has exactly one factory per registry id", () => {
    expect(Object.keys(FACTORIES).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it("builds a model instance for every non-custom provider", () => {
    for (const id of PROVIDER_IDS) {
      if (id === "custom") continue;
      const model = resolveModel({
        provider: id,
        model: "some-model",
        apiKey: "test-key",
      });
      expect(model, id).toBeTruthy();
      expect(typeof model.doGenerate, id).toBe("function");
    }
  });

  it("builds a model instance for custom when a base URL is given", () => {
    const model = resolveModel({
      provider: "custom",
      model: "qwen3-max",
      apiKey: "test-key",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(typeof model.doGenerate).toBe("function");
  });

  it("throws for custom without a base URL", () => {
    expect(() =>
      resolveModel({ provider: "custom", model: "x", apiKey: "k" }),
    ).toThrow(/base url/i);
  });

  it("throws for an unknown provider", () => {
    expect(() =>
      resolveModel({ provider: "nope", model: "x", apiKey: "k" }),
    ).toThrow(/unknown provider/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- providers.server`
Expected: FAIL — cannot resolve `@/src/lib/providers.server`.

- [ ] **Step 3: Write the factories**

Create `src/lib/providers.server.ts`.

```ts
import "server-only";

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
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- providers.server`
Expected: PASS, 5 tests.

If the import of `server-only` fails under Vitest, drop that line — it is a Next.js build-time guard, and the two-file split already keeps the SDKs out of the client bundle.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/providers.server.ts src/lib/providers.server.test.ts
git add src/lib/providers.server.ts src/lib/providers.server.test.ts
git commit -m "feat: add server-only AI SDK provider factories"
```

---

### Task 4: Provider error mapping

**Files:**

- Create: `src/lib/llm-errors.ts`
- Test: `src/lib/llm-errors.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces:
  - `type LlmErrorCode = "invalid_key" | "bad_model" | "no_credit" | "rate_limited" | "provider_unreachable" | "provider_error"`
  - `type MappedLlmError = { code: LlmErrorCode; message: string; status: number }`
  - `function mapProviderError(err: unknown, providerLabel: string, model: string): MappedLlmError`

`status` is the HTTP status our own route returns. Never put raw provider response bodies in `message` — they can carry organization identifiers.

- [ ] **Step 1: Write the failing test**

Create `src/lib/llm-errors.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { APICallError, NoObjectGeneratedError, RetryError } from "ai";
import { mapProviderError } from "@/src/lib/llm-errors";

const apiError = (statusCode: number, body = "") =>
  new APICallError({
    message: "boom",
    url: "https://api.example.com/v1/chat",
    requestBodyValues: {},
    statusCode,
    responseBody: body,
    isRetryable: statusCode === 429,
  });

describe("mapProviderError", () => {
  it.each([
    [401, "invalid_key", 400],
    [403, "invalid_key", 400],
    [404, "bad_model", 400],
    [402, "no_credit", 400],
    [429, "rate_limited", 429],
    [500, "provider_error", 502],
  ])("maps HTTP %i to %s", (status, code, outStatus) => {
    const r = mapProviderError(apiError(status), "OpenAI", "gpt-5-mini");
    expect(r.code).toBe(code);
    expect(r.status).toBe(outStatus);
  });

  it("reads insufficient_quota out of a 400 body as no_credit", () => {
    const r = mapProviderError(
      apiError(400, '{"error":{"code":"insufficient_quota"}}'),
      "OpenAI",
      "gpt-5-mini",
    );
    expect(r.code).toBe("no_credit");
  });

  it("unwraps RetryError to find the APICallError", () => {
    const r = mapProviderError(
      new RetryError({
        message: "retries exhausted",
        reason: "maxRetriesExceeded",
        errors: [apiError(429)],
      }),
      "Groq",
      "llama-4-scout",
    );
    expect(r.code).toBe("rate_limited");
  });

  it("maps a network failure to provider_unreachable", () => {
    const r = mapProviderError(
      new TypeError("fetch failed"),
      "Custom",
      "qwen3-max",
    );
    expect(r.code).toBe("provider_unreachable");
    expect(r.status).toBe(502);
  });

  it("maps unparseable model output to provider_error", () => {
    const r = mapProviderError(
      new NoObjectGeneratedError({ message: "no object", text: "not json" }),
      "Groq",
      "llama-4-scout",
    );
    expect(r.code).toBe("provider_error");
  });

  it("names the provider and model in the message but never the key", () => {
    const r = mapProviderError(apiError(404), "Anthropic", "claude-nope");
    expect(r.message).toContain("Anthropic");
    expect(r.message).toContain("claude-nope");
  });

  it("never leaks the raw provider body", () => {
    const r = mapProviderError(
      apiError(500, "org_id=acme-secret"),
      "OpenAI",
      "gpt-5",
    );
    expect(r.message).not.toContain("acme-secret");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- llm-errors`
Expected: FAIL — cannot resolve `@/src/lib/llm-errors`.

- [ ] **Step 3: Write the mapper**

Create `src/lib/llm-errors.ts`:

```ts
import { APICallError, NoObjectGeneratedError, RetryError } from "ai";

export type LlmErrorCode =
  | "invalid_key"
  | "bad_model"
  | "no_credit"
  | "rate_limited"
  | "provider_unreachable"
  | "provider_error";

export type MappedLlmError = {
  code: LlmErrorCode;
  /** Safe to show a visitor. Never contains the key or a raw provider body. */
  message: string;
  /** HTTP status our own route should return. */
  status: number;
};

/** A retryable failure arrives wrapped in RetryError; dig the APICallError out. */
function unwrap(err: unknown): unknown {
  if (RetryError.isInstance(err)) {
    const inner = err.errors.find((e) => APICallError.isInstance(e));
    return inner ?? err.lastError ?? err;
  }
  return err;
}

function looksLikeQuota(body: string | undefined): boolean {
  if (!body) return false;
  return /insufficient_quota|insufficient[_ ]balance|billing|credit/i.test(
    body,
  );
}

export function mapProviderError(
  err: unknown,
  providerLabel: string,
  model: string,
): MappedLlmError {
  const e = unwrap(err);

  if (APICallError.isInstance(e)) {
    const status = e.statusCode;

    if (status === 401 || status === 403) {
      return {
        code: "invalid_key",
        message: `${providerLabel} rejected this key. Check it is still active, then paste it again.`,
        status: 400,
      };
    }
    if (status === 402 || looksLikeQuota(e.responseBody)) {
      return {
        code: "no_credit",
        message: `This ${providerLabel} account is out of credit. Add credit, or switch to a provider with a free key.`,
        status: 400,
      };
    }
    if (status === 404) {
      return {
        code: "bad_model",
        message: `${providerLabel} has no model called ${model}. Pick a model your key can reach.`,
        status: 400,
      };
    }
    if (status === 429) {
      return {
        code: "rate_limited",
        message: `${providerLabel} is rate limiting this key. Wait a moment, then try again.`,
        status: 429,
      };
    }
    if (status === undefined) {
      return {
        code: "provider_unreachable",
        message: `Could not reach ${providerLabel}. Check the base URL and your connection.`,
        status: 502,
      };
    }
    return {
      code: "provider_error",
      message: `${providerLabel} returned an error (HTTP ${status}). Try again in a moment.`,
      status: 502,
    };
  }

  if (NoObjectGeneratedError.isInstance(e)) {
    return {
      code: "provider_error",
      message: `${model} did not return usable suggestions. Try again, or pick a different model.`,
      status: 502,
    };
  }

  // fetch() rejects with a TypeError on DNS failure, refused connection or CORS.
  if (e instanceof TypeError && /fetch/i.test(e.message)) {
    return {
      code: "provider_unreachable",
      message: `Could not reach ${providerLabel}. Check the base URL and your connection.`,
      status: 502,
    };
  }

  return {
    code: "provider_error",
    message: `Something went wrong talking to ${providerLabel}. Try again in a moment.`,
    status: 502,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- llm-errors`
Expected: PASS, 12 tests (the `it.each` counts as 6).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/llm-errors.ts src/lib/llm-errors.test.ts
git add src/lib/llm-errors.ts src/lib/llm-errors.test.ts
git commit -m "feat: map provider failures to typed error codes"
```

---

### Task 5: Domain availability module

**Files:**

- Create: `src/lib/domains.ts`
- Test: `src/lib/domains.test.ts`
- Read for reference: `src/app/api/generate/route.ts` (the `checkDomainAvailability` function at the bottom)

**Interfaces:**

- Consumes: the default export of `@/src/lib/db` (a `pg` `Pool`).
- Produces:
  - `type DomainSuggestion = { name: string; tld: string }`
  - `type AffiliateLinks = { godaddy: string; namecheap: string }`
  - `type DomainResult = { name: string; available: boolean; affiliateLinks: AffiliateLinks | null }`
  - `function affiliateLinksFor(fullDomain: string): AffiliateLinks`
  - `async function checkAvailability(suggestions: DomainSuggestion[]): Promise<DomainResult[]>`

Behavior is a straight move from the existing route. **Preserve the existing fallback:** if the database query throws, every domain is reported available. That is today's behavior and the test pins it so a future refactor cannot change it silently.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domains.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("@/src/lib/db", () => ({ default: { query } }));

import { affiliateLinksFor, checkAvailability } from "@/src/lib/domains";

beforeEach(() => query.mockReset());

describe("checkAvailability", () => {
  it("marks a domain in the table as unavailable and the rest available", async () => {
    query.mockResolvedValue({ rows: [{ domain: "taken.com" }] });

    const results = await checkAvailability([
      { name: "taken", tld: "com" },
      { name: "free", tld: "io" },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      name: "taken.com",
      available: false,
      affiliateLinks: null,
    });
    expect(results[1].name).toBe("free.io");
    expect(results[1].available).toBe(true);
    expect(results[1].affiliateLinks).not.toBeNull();
  });

  it("matches case-insensitively", async () => {
    query.mockResolvedValue({ rows: [{ domain: "TAKEN.COM" }] });
    const results = await checkAvailability([{ name: "Taken", tld: "Com" }]);
    expect(results[0].available).toBe(false);
  });

  it("reports everything available when the query throws", async () => {
    query.mockRejectedValue(new Error("connection refused"));
    const results = await checkAvailability([{ name: "any", tld: "com" }]);
    expect(results[0].available).toBe(true);
  });

  it("runs one query for the whole batch", async () => {
    query.mockResolvedValue({ rows: [] });
    await checkAvailability([
      { name: "a", tld: "com" },
      { name: "b", tld: "com" },
      { name: "c", tld: "com" },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array for no suggestions", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await checkAvailability([])).toEqual([]);
  });
});

describe("affiliateLinksFor", () => {
  it("url-encodes the target inside both links", () => {
    const links = affiliateLinksFor("my-thing.io");
    expect(links.godaddy).toContain(
      encodeURIComponent("domainToCheck=my-thing.io"),
    );
    expect(links.namecheap).toContain(encodeURIComponent("domain=my-thing.io"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- domains`
Expected: FAIL — cannot resolve `@/src/lib/domains`.

- [ ] **Step 3: Write the module**

Create `src/lib/domains.ts`:

```ts
import pool from "@/src/lib/db";

export type DomainSuggestion = { name: string; tld: string };

export type AffiliateLinks = { godaddy: string; namecheap: string };

export type DomainResult = {
  name: string;
  available: boolean;
  affiliateLinks: AffiliateLinks | null;
};

export function affiliateLinksFor(fullDomain: string): AffiliateLinks {
  return {
    godaddy: `https://www.anrdoezrs.net/click-101410219-11774111?url=${encodeURIComponent(
      `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${fullDomain}`,
    )}`,
    namecheap: `https://www.anrdoezrs.net/click-101410219-12892698?url=${encodeURIComponent(
      `https://www.namecheap.com/domains/registration/results/?domain=${fullDomain}`,
    )}`,
  };
}

/**
 * Checks each suggestion against the registered-domain table.
 *
 * The table is a snapshot of registered domains, so `available: true` means
 * "not in our snapshot", not an authoritative registry answer.
 *
 * If the query fails, everything is reported available. This is deliberate and
 * matches the original behavior: a database outage must not block the page.
 */
export async function checkAvailability(
  suggestions: DomainSuggestion[],
): Promise<DomainResult[]> {
  if (suggestions.length === 0) return [];

  const fullDomains = suggestions.map((d) =>
    `${d.name}.${d.tld}`.toLowerCase(),
  );
  let registered = new Set<string>();

  try {
    const result = await pool.query({
      text: `SELECT domain FROM domains WHERE domain = ANY($1)`,
      values: [fullDomains],
    });
    registered = new Set(
      result.rows.map((row: { domain: string }) => row.domain.toLowerCase()),
    );
  } catch (error) {
    console.error("Database query error:", error);
  }

  return suggestions.map((d) => {
    const fullDomain = `${d.name}.${d.tld}`;
    const available = !registered.has(fullDomain.toLowerCase());
    return {
      name: fullDomain,
      available,
      affiliateLinks: available ? affiliateLinksFor(fullDomain) : null,
    };
  });
}
```

Note the original built `fullDomains` without lowercasing before the query. Lowercasing both sides is the fix the case-insensitivity test demands.

- [ ] **Step 4: Run the tests**

Run: `npm test -- domains`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/domains.ts src/lib/domains.test.ts
git add src/lib/domains.ts src/lib/domains.test.ts
git commit -m "feat: extract domain availability into its own module"
```

---

### Task 6: Prompt construction and generation

**Files:**

- Create: `src/lib/generate.ts`
- Test: `src/lib/generate.test.ts`
- Read for reference: `src/app/api/generate/route.ts` (the `buildPrompt` function)

**Interfaces:**

- Consumes: `DomainSuggestion` from `@/src/lib/domains`.
- Produces:
  - `type GenerateParams = { keywords: string[]; description?: string; domainLength: number; domainStyle: string; tlds?: string[] }`
  - `const SYSTEM_PROMPT: string`
  - `const domainSuggestionSchema` — zod schema
  - `function buildPrompt(params: GenerateParams): string`
  - `async function generateDomains(model: LanguageModelV4, params: GenerateParams): Promise<DomainSuggestion[]>`

- [ ] **Step 1: Write the failing test**

Create `src/lib/generate.test.ts`. The generation tests use `MockLanguageModelV4`. The fixture shapes below are mandatory: provider-level `finishReason` is an object and `usage` is nested. A bare `"stop"` string does not throw — it silently yields `undefined`.

```ts
import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { buildPrompt, generateDomains } from "@/src/lib/generate";

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const finishReason = { unified: "stop", raw: "stop" } as const;

const mockReturning = (payload: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      finishReason,
      usage,
      content: [{ type: "text", text: JSON.stringify(payload) }],
      warnings: [],
    }),
  });

const base = {
  keywords: ["tattoo"],
  domainLength: 10,
  domainStyle: "balanced",
};

describe("buildPrompt", () => {
  it("includes the keywords", () => {
    expect(buildPrompt({ ...base, keywords: ["tattoo", "booking"] })).toContain(
      "tattoo, booking",
    );
  });

  it("includes the description when given and omits the line when not", () => {
    expect(buildPrompt({ ...base, description: "A booking tool" })).toContain(
      "A booking tool",
    );
    expect(buildPrompt(base)).not.toContain("Project Description:");
  });

  it("constrains to the chosen TLDs when the user picked some", () => {
    const p = buildPrompt({ ...base, tlds: ["io", "dev"] });
    expect(p).toContain("io, dev");
    expect(p).toMatch(/only use these specific TLDs/i);
  });

  it("suggests creative TLDs for a creative style when none were picked", () => {
    const p = buildPrompt({ ...base, domainStyle: "creative" });
    expect(p).toContain("xyz");
  });

  it("suggests popular TLDs for a professional style when none were picked", () => {
    const p = buildPrompt({ ...base, domainStyle: "professional" });
    expect(p).toContain("com");
    expect(p).not.toContain("design");
  });

  it("works from a description alone with no keywords", () => {
    const p = buildPrompt({
      ...base,
      keywords: [],
      description: "A booking tool",
    });
    expect(p).toContain("A booking tool");
  });
});

describe("generateDomains", () => {
  it("returns the parsed suggestions", async () => {
    const model = mockReturning({
      domains: [
        { name: "inkslot", tld: "com" },
        { name: "needlebook", tld: "io" },
        { name: "flashbook", tld: "co" },
        { name: "tattoodesk", tld: "app" },
        { name: "skinslot", tld: "dev" },
      ],
    });

    const out = await generateDomains(model, base);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ name: "inkslot", tld: "com" });
  });

  it("sends the instructions and the prompt to the model", async () => {
    const model = mockReturning({
      domains: Array.from({ length: 5 }, (_, i) => ({
        name: `n${i}`,
        tld: "com",
      })),
    });
    await generateDomains(model, base);
    expect(model.doGenerateCalls).toHaveLength(1);
  });

  it("rejects when the model returns fewer than five suggestions", async () => {
    const model = mockReturning({ domains: [{ name: "one", tld: "com" }] });
    await expect(generateDomains(model, base)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- generate`
Expected: FAIL — cannot resolve `@/src/lib/generate`.

- [ ] **Step 3: Write the module**

Create `src/lib/generate.ts`. The prompt text is carried over from the current route so output quality does not regress; the only change is that keywords may now be empty.

```ts
import { Output, generateText } from "ai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import { z } from "zod";

import type { DomainSuggestion } from "@/src/lib/domains";

const POPULAR_TLDS = ["com", "net", "org", "io", "co", "app", "dev"];
const CREATIVE_TLDS = ["ai", "io", "co", "me", "app", "xyz", "tech", "design"];

export type GenerateParams = {
  keywords: string[];
  description?: string;
  domainLength: number;
  domainStyle: string;
  tlds?: string[];
};

export const SYSTEM_PROMPT =
  "You are a domain name generation expert. Generate creative, memorable, and " +
  "available domain names based on the provided keywords and parameters.";

export const domainSuggestionSchema = z.object({
  domains: z
    .array(z.object({ name: z.string().min(1), tld: z.string().min(1) }))
    .min(5)
    .max(10),
});

export function buildPrompt(params: GenerateParams): string {
  const { keywords, description, domainLength, domainStyle, tlds } = params;
  const userSelectedTlds = Boolean(tlds && tlds.length > 0);

  const tldInstructions = userSelectedTlds
    ? `TLDs to consider: ${tlds!.join(", ")}
Please only use these specific TLDs in your suggestions.`
    : `No specific TLDs were selected by the user.
Please choose appropriate TLDs from popular options like: ${(domainStyle ===
        "creative" || domainStyle === "funny"
        ? CREATIVE_TLDS
        : POPULAR_TLDS
      ).join(", ")}
Select the TLD that best fits each domain name. For professional domains, prefer .com when appropriate.
For each suggestion, pick the TLD that enhances the domain's meaning or marketability.`;

  return `
Generate domain name suggestions based on the following parameters:

${keywords.length > 0 ? `Keywords: ${keywords.join(", ")}` : ""}
${description ? `Project Description: ${description}` : ""}
Preferred Domain Length: ${domainLength} characters (approximately for the name part, excluding TLD)
Domain Style: ${domainStyle}

${tldInstructions}

Please provide 5-10 domain name suggestions that:
1. Are creative and memorable
2. Reflect the keywords and project description
3. Match the requested style (${domainStyle})
4. Are approximately ${domainLength} characters long (excluding TLD)
5. Would likely be available (not common words or very short domains)
6. Each suggestion should include both the domain name and an appropriate TLD

Explanation for different styles:
- "short": Brief, concise domains that are easy to remember
- "brandable": Unique, made-up words that can become strong brand identifiers
- "balanced": A good mix of meaningfulness and creativity
- "creative": Unusual, innovative combinations that stand out
- "funny": Playful, humorous domains that evoke a smile
- "professional": Serious, trustworthy domains suitable for business
`;
}

export async function generateDomains(
  model: LanguageModelV4,
  params: GenerateParams,
): Promise<DomainSuggestion[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: domainSuggestionSchema }),
    instructions: SYSTEM_PROMPT,
    prompt: buildPrompt(params),
    temperature: 0.7,
  });

  return output.domains;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- generate`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/generate.ts src/lib/generate.test.ts
git add src/lib/generate.ts src/lib/generate.test.ts
git commit -m "feat: add provider-agnostic domain generation"
```

---

### Task 7: Rewrite `/api/generate`

**Files:**

- Modify: `src/app/api/generate/route.ts` (full rewrite)
- Test: `src/app/api/generate/route.test.ts`

**Interfaces:**

- Consumes: `resolveModel`, `LlmCredentials`, `generateDomains`, `checkAvailability`, `mapProviderError`, `getProvider`.
- Produces: `POST(request: Request): Promise<NextResponse>` and the exported `generateRequestSchema`.

Response on success: `{ results: DomainResult[] }`.
Response on failure: `{ error: string; code?: LlmErrorCode; details?: unknown }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/generate/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveModel = vi.fn();
const generateDomains = vi.fn();
const checkAvailability = vi.fn();

vi.mock("@/src/lib/providers.server", () => ({ resolveModel }));
vi.mock("@/src/lib/generate", async (orig) => ({
  ...(await orig<typeof import("@/src/lib/generate")>()),
  generateDomains,
}));
vi.mock("@/src/lib/domains", async (orig) => ({
  ...(await orig<typeof import("@/src/lib/domains")>()),
  checkAvailability,
}));

import { POST } from "@/src/app/api/generate/route";

const llm = { provider: "openai", model: "gpt-5-mini", apiKey: "sk-test" };
const body = (o: Record<string, unknown>) =>
  new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(o),
  });

beforeEach(() => {
  resolveModel.mockReset().mockReturnValue({});
  generateDomains.mockReset().mockResolvedValue([{ name: "x", tld: "com" }]);
  checkAvailability
    .mockReset()
    .mockResolvedValue([
      { name: "x.com", available: true, affiliateLinks: null },
    ]);
});

describe("POST /api/generate", () => {
  it("400s and never builds a model when llm is missing", async () => {
    const res = await POST(
      body({ keywords: ["a"], domainLength: 10, domainStyle: "balanced" }),
    );
    expect(res.status).toBe(400);
    expect(resolveModel).not.toHaveBeenCalled();
  });

  it("400s when neither keywords nor description are given", async () => {
    const res = await POST(
      body({
        keywords: [],
        description: "  ",
        domainLength: 10,
        domainStyle: "balanced",
        llm,
      }),
    );
    expect(res.status).toBe(400);
    expect(resolveModel).not.toHaveBeenCalled();
  });

  it("accepts keywords with no description", async () => {
    const res = await POST(
      body({
        keywords: ["tattoo"],
        domainLength: 10,
        domainStyle: "balanced",
        llm,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("accepts a description with no keywords", async () => {
    const res = await POST(
      body({
        keywords: [],
        description: "A booking tool",
        domainLength: 10,
        domainStyle: "balanced",
        llm,
      }),
    );
    expect(res.status).toBe(200);
  });

  it("returns the availability results", async () => {
    const res = await POST(
      body({
        keywords: ["tattoo"],
        domainLength: 10,
        domainStyle: "balanced",
        llm,
      }),
    );
    await expect(res.json()).resolves.toEqual({
      results: [{ name: "x.com", available: true, affiliateLinks: null }],
    });
  });

  it("400s with code invalid_key when the provider rejects the key", async () => {
    const { APICallError } = await import("ai");
    generateDomains.mockRejectedValue(
      new APICallError({
        message: "bad key",
        url: "https://api.openai.com/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 401,
        isRetryable: false,
      }),
    );
    const res = await POST(
      body({
        keywords: ["tattoo"],
        domainLength: 10,
        domainStyle: "balanced",
        llm,
      }),
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "invalid_key" });
  });

  it("400s for an unknown provider id", async () => {
    const res = await POST(
      body({
        keywords: ["tattoo"],
        domainLength: 10,
        domainStyle: "balanced",
        llm: { ...llm, provider: "nope" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("400s for custom without a base URL", async () => {
    const res = await POST(
      body({
        keywords: ["tattoo"],
        domainLength: 10,
        domainStyle: "balanced",
        llm: { provider: "custom", model: "qwen3-max", apiKey: "k" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("never echoes the api key in a response", async () => {
    generateDomains.mockRejectedValue(new Error("boom"));
    const res = await POST(
      body({
        keywords: ["tattoo"],
        domainLength: 10,
        domainStyle: "balanced",
        llm,
      }),
    );
    expect(JSON.stringify(await res.json())).not.toContain("sk-test");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- api/generate`
Expected: FAIL — the current route has no `llm` handling, so the first test gets a 500 or a 200.

- [ ] **Step 3: Rewrite the route**

Replace the entire contents of `src/app/api/generate/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";

import { checkAvailability } from "@/src/lib/domains";
import { generateDomains } from "@/src/lib/generate";
import { mapProviderError } from "@/src/lib/llm-errors";
import { getProvider } from "@/src/lib/providers";
import { resolveModel } from "@/src/lib/providers.server";

const llmSchema = z
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

export const generateRequestSchema = z
  .object({
    keywords: z.array(z.string().max(30)).max(5).default([]),
    description: z.string().max(300).optional(),
    domainLength: z.number().min(3).max(20),
    domainStyle: z.string().min(1),
    tlds: z.array(z.string()).optional(),
    llm: llmSchema,
  })
  .refine(
    (d) => d.keywords.length > 0 || (d.description ?? "").trim().length > 0,
    {
      message: "Provide keywords or a description",
      path: ["keywords"],
    },
  );

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = generateRequestSchema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request data", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { llm, ...params } = parsed.data;
  const providerLabel = getProvider(llm.provider)?.label ?? llm.provider;

  try {
    const model = resolveModel(llm);
    const suggestions = await generateDomains(model, params);
    const results = await checkAvailability(suggestions);
    return NextResponse.json({ results });
  } catch (error) {
    const mapped = mapProviderError(error, providerLabel, llm.model);
    // Log the code only. The error object can carry request bodies.
    console.error("Generation failed:", mapped.code);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status },
    );
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- api/generate`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/app/api/generate/route.ts src/app/api/generate/route.test.ts
git add src/app/api/generate
git commit -m "feat: drive /api/generate from a caller-supplied LLM key"
```

---

### Task 8: `/api/test-connection`

**Files:**

- Create: `src/app/api/test-connection/route.ts`
- Test: `src/app/api/test-connection/route.test.ts`

**Interfaces:**

- Consumes: `resolveModel`, `mapProviderError`, `getProvider`.
- Produces: `POST(request: Request): Promise<NextResponse>`. Success is `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/test-connection/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveModel = vi.fn();
const generateText = vi.fn();

vi.mock("@/src/lib/providers.server", () => ({ resolveModel }));
vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  generateText,
}));

import { POST } from "@/src/app/api/test-connection/route";

const body = (o: Record<string, unknown>) =>
  new Request("http://localhost/api/test-connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(o),
  });

const llm = { provider: "openai", model: "gpt-5-mini", apiKey: "sk-test" };

beforeEach(() => {
  resolveModel.mockReset().mockReturnValue({});
  generateText.mockReset().mockResolvedValue({ text: "ok" });
});

describe("POST /api/test-connection", () => {
  it("returns ok for a working key", async () => {
    const res = await POST(body(llm));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("asks for a single output token", async () => {
    await POST(body(llm));
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 1 }),
    );
  });

  it("400s with code invalid_key on a 401", async () => {
    const { APICallError } = await import("ai");
    generateText.mockRejectedValue(
      new APICallError({
        message: "bad key",
        url: "https://api.openai.com/v1/chat/completions",
        requestBodyValues: {},
        statusCode: 401,
        isRetryable: false,
      }),
    );
    const res = await POST(body(llm));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ code: "invalid_key" });
  });

  it("400s for a malformed body", async () => {
    const res = await POST(body({ provider: "openai" }));
    expect(res.status).toBe(400);
    expect(resolveModel).not.toHaveBeenCalled();
  });

  it("never echoes the api key", async () => {
    generateText.mockRejectedValue(new Error("boom"));
    const res = await POST(body(llm));
    expect(JSON.stringify(await res.json())).not.toContain("sk-test");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- test-connection`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Write the route**

Create `src/app/api/test-connection/route.ts`:

```ts
import { generateText } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";

import { mapProviderError } from "@/src/lib/llm-errors";
import { getProvider } from "@/src/lib/providers";
import { resolveModel } from "@/src/lib/providers.server";

const schema = z
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

export async function POST(request: Request) {
  let parsed;
  try {
    parsed = schema.safeParse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request data" },
      { status: 400 },
    );
  }

  const llm = parsed.data;
  const providerLabel = getProvider(llm.provider)?.label ?? llm.provider;

  try {
    const model = resolveModel(llm);
    // One token. Enough to prove the key and the model id, costs a fraction of a cent.
    await generateText({ model, prompt: "ok", maxOutputTokens: 1 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const mapped = mapProviderError(error, providerLabel, llm.model);
    console.error("Connection test failed:", mapped.code);
    return NextResponse.json(
      { error: mapped.message, code: mapped.code },
      { status: mapped.status },
    );
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- test-connection`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/app/api/test-connection/route.ts src/app/api/test-connection/route.test.ts
git add src/app/api/test-connection
git commit -m "feat: add /api/test-connection for validating a key"
```

---

### Task 9: `useLlmConfig` hook

**Files:**

- Create: `src/hooks/use-llm-config.ts`
- Test: `src/hooks/use-llm-config.test.ts`

**Interfaces:**

- Consumes: `getProvider`, `defaultModel` from `@/src/lib/providers`.
- Produces:
  - `type LlmConfig = { provider: string; model: string; apiKey: string; baseUrl?: string }`
  - `const LLM_STORAGE_KEY = "dodomains.llm.v1"`
  - `function readStoredConfig(raw: string | null): LlmConfig | null` — pure, exported for testing
  - `function useLlmConfig(): { config: LlmConfig | null; save: (c: LlmConfig) => void; clear: () => void; ready: boolean }`

`readStoredConfig` is a plain function so the storage-validation logic is testable without a React renderer. The hook is a thin wrapper.

- [ ] **Step 1: Write the failing test**

Create `src/hooks/use-llm-config.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readStoredConfig } from "@/src/hooks/use-llm-config";

const valid = { provider: "openai", model: "gpt-5-mini", apiKey: "sk-test" };

describe("readStoredConfig", () => {
  it("returns null for nothing stored", () => {
    expect(readStoredConfig(null)).toBeNull();
  });

  it("returns null for unparseable json", () => {
    expect(readStoredConfig("{not json")).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    expect(readStoredConfig(JSON.stringify({ provider: "openai" }))).toBeNull();
  });

  it("returns null for a provider that no longer exists", () => {
    expect(
      readStoredConfig(JSON.stringify({ ...valid, provider: "gone" })),
    ).toBeNull();
  });

  it("returns null for custom without a base url", () => {
    expect(
      readStoredConfig(JSON.stringify({ ...valid, provider: "custom" })),
    ).toBeNull();
  });

  it("accepts a valid config", () => {
    expect(readStoredConfig(JSON.stringify(valid))).toEqual(valid);
  });

  it("accepts a valid custom config", () => {
    const custom = {
      ...valid,
      provider: "custom",
      baseUrl: "http://localhost:11434/v1",
    };
    expect(readStoredConfig(JSON.stringify(custom))).toEqual(custom);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- use-llm-config`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Write the hook**

Create `src/hooks/use-llm-config.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

import { getProvider } from "@/src/lib/providers";

export type LlmConfig = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
};

export const LLM_STORAGE_KEY = "dodomains.llm.v1";

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Validates whatever is in storage. A stored config can go stale when a
 * provider is removed from the registry, so this rejects rather than trusts.
 */
export function readStoredConfig(raw: string | null): LlmConfig | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const c = parsed as Record<string, unknown>;

  if (!isNonEmptyString(c.provider)) return null;
  if (!isNonEmptyString(c.model)) return null;
  if (!isNonEmptyString(c.apiKey)) return null;

  const meta = getProvider(c.provider);
  if (!meta) return null;
  if (meta.needsBaseUrl && !isNonEmptyString(c.baseUrl)) return null;

  return {
    provider: c.provider,
    model: c.model,
    apiKey: c.apiKey,
    ...(isNonEmptyString(c.baseUrl) ? { baseUrl: c.baseUrl } : {}),
  };
}

export function useLlmConfig() {
  const [config, setConfig] = useState<LlmConfig | null>(null);
  const [ready, setReady] = useState(false);

  // Storage is read after mount so the server and client render the same markup.
  useEffect(() => {
    try {
      setConfig(readStoredConfig(window.localStorage.getItem(LLM_STORAGE_KEY)));
    } catch {
      setConfig(null);
    }
    setReady(true);
  }, []);

  const save = useCallback((next: LlmConfig) => {
    setConfig(next);
    try {
      window.localStorage.setItem(LLM_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Private browsing can refuse writes. The in-memory config still works
      // for this session.
    }
  }, []);

  const clear = useCallback(() => {
    setConfig(null);
    try {
      window.localStorage.removeItem(LLM_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  return { config, save, clear, ready };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- use-llm-config`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/hooks/use-llm-config.ts src/hooks/use-llm-config.test.ts
git add src/hooks/use-llm-config.ts src/hooks/use-llm-config.test.ts
git commit -m "feat: add useLlmConfig with stale-config validation"
```

---

### Task 10: Model connection button and dropdown

**Files:**

- Create: `src/components/model-connection.tsx`
- Read for reference: `docs/superpowers/specs/assets/2026-08-06-byo-key-mockup.html`, `src/app/page.tsx:225-247` (the GitHub button whose styling this matches)

**Interfaces:**

- Consumes: `useLlmConfig`, `LlmConfig`, `PROVIDERS`, `getProvider`, `defaultModel`, and the existing `Button`, `Input`, `Label`, `Badge`, `Select` from `src/components/ui/`.
- Produces:
  - `type ModelConnectionProps = { open: boolean; onOpenChange: (open: boolean) => void }`
  - `export function ModelConnection(props: ModelConnectionProps): JSX.Element`

**The panel is controlled by the parent.** Task 11 needs to open it from the gated Generate button, so open state lives in `page.tsx`, not here.

There is no unit test for this task. It is presentational and every piece of logic it leans on is already covered by Tasks 2, 4 and 9. Verify it by hand in Step 3.

- [ ] **Step 1: Build the component**

Create `src/components/model-connection.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import { useLlmConfig, type LlmConfig } from "@/src/hooks/use-llm-config";
import { PROVIDERS, defaultModel, getProvider } from "@/src/lib/providers";
import { cn } from "@/src/lib/utils";

export type ModelConnectionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Status = "idle" | "testing" | "failed";

export function ModelConnection({ open, onOpenChange }: ModelConnectionProps) {
  const { config, save, clear, ready } = useLlmConfig();

  const [providerId, setProviderId] = useState("openai");
  const [model, setModel] = useState(defaultModel("openai"));
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const meta = getProvider(providerId);

  // Fill the form from storage once it has been read.
  useEffect(() => {
    if (!ready || !config) return;
    setProviderId(config.provider);
    setModel(config.model);
    setApiKey(config.apiKey);
    setBaseUrl(config.baseUrl ?? "");
  }, [ready, config]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  function pickProvider(id: string) {
    setProviderId(id);
    setModel(defaultModel(id));
    setApiKey(""); // never carry one provider's key to another
    setBaseUrl("");
    setError(null);
    setStatus("idle");
  }

  const prefixMismatch = Boolean(
    apiKey && meta?.keyPrefix && !apiKey.startsWith(meta.keyPrefix),
  );

  const canSubmit =
    Boolean(apiKey && model && meta) &&
    (!meta?.needsBaseUrl || baseUrl.trim().length > 0) &&
    status !== "testing";

  async function saveAndTest() {
    if (!meta) return;
    const next: LlmConfig = {
      provider: providerId,
      model,
      apiKey,
      ...(meta.needsBaseUrl ? { baseUrl } : {}),
    };

    setStatus("testing");
    setError(null);

    try {
      const res = await fetch("/api/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("failed");
        setError(data.error ?? "Could not reach the provider.");
        return;
      }
      save(next);
      setStatus("idle");
      onOpenChange(false);
    } catch {
      setStatus("failed");
      setError("Could not reach dodomains. Check your connection.");
    }
  }

  function clearAll() {
    clear();
    setApiKey("");
    setStatus("idle");
    setError(null);
  }

  const dot =
    status === "testing"
      ? "bg-muted-foreground animate-pulse"
      : status === "failed"
        ? "bg-destructive"
        : config
          ? "bg-chart-2"
          : "bg-muted-foreground";

  const triggerLabel =
    status === "testing"
      ? "Testing…"
      : status === "failed"
        ? "Key rejected"
        : config
          ? (getProvider(config.provider)?.label ?? config.provider)
          : "Connect model";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-background/80 hover:bg-background/90 transition-colors backdrop-blur-sm border-2 border-border/70"
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} />
        <span className="max-w-32 truncate">{triggerLabel}</span>
        {config && status === "idle" ? (
          <span className="hidden sm:inline font-mono text-xs text-muted-foreground max-w-32 truncate">
            {config.model}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => onOpenChange(false)}
          />
          <div
            role="dialog"
            aria-label="Connect your model"
            className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-5rem)] overflow-y-auto rounded-lg border bg-background p-5 shadow-lg"
          >
            <div className="grid gap-5">
              <div className="grid gap-1">
                <h2 className="font-semibold">Connect your model</h2>
                <p className="text-sm text-muted-foreground">
                  Bring a key from any provider. You pay the provider directly,
                  at their cost.
                </p>
              </div>

              {error ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                  {error}
                </div>
              ) : null}

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="llm-provider">Provider</Label>
                  {meta?.free ? <Badge>Allows free API key</Badge> : null}
                </div>
                <Select value={providerId} onValueChange={pickProvider}>
                  <SelectTrigger id="llm-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="llm-model">Model</Label>
                  <a
                    href="https://hail.so/costs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Compare prices ↗
                  </a>
                </div>
                <Input
                  id="llm-model"
                  className="font-mono"
                  list="llm-model-options"
                  value={model}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setModel(e.target.value)}
                />
                <datalist id="llm-model-options">
                  {(meta?.models ?? []).map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      label={`$${m.in.toFixed(2)} / $${m.out.toFixed(2)}`}
                    />
                  ))}
                </datalist>
                <span className="text-xs text-muted-foreground">
                  {meta?.gateway
                    ? `${meta.label} uses its own model ids. Copy the exact id from ${meta.keyHost}.`
                    : "Pick one, or type any model id your key can reach."}
                </span>
              </div>

              {meta?.needsBaseUrl ? (
                <div className="grid gap-2">
                  <Label htmlFor="llm-base-url">Base URL</Label>
                  <Input
                    id="llm-base-url"
                    className="font-mono"
                    placeholder="http://localhost:11434/v1"
                    value={baseUrl}
                    spellCheck={false}
                    onChange={(e) => setBaseUrl(e.target.value)}
                  />
                  <span className="text-xs text-muted-foreground">
                    Any OpenAI-compatible endpoint.
                  </span>
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label htmlFor="llm-key">API key</Label>
                <div className="relative flex">
                  <Input
                    id="llm-key"
                    className="font-mono pr-14"
                    type={revealed ? "text" : "password"}
                    placeholder={
                      meta?.keyPrefix ? `${meta.keyPrefix}...` : "your API key"
                    }
                    value={apiKey}
                    autoComplete="off"
                    spellCheck={false}
                    // Pasted keys routinely carry a stray space or quote.
                    onChange={(e) =>
                      setApiKey(e.target.value.replace(/[\s"']/g, ""))
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setRevealed((v) => !v)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {revealed ? "hide" : "show"}
                  </button>
                </div>
                {prefixMismatch ? (
                  <span className="text-xs text-destructive">
                    {meta?.label} keys start with &quot;{meta?.keyPrefix}&quot;.
                    Check you copied all of it.
                  </span>
                ) : null}
              </div>

              <p className="text-xs text-muted-foreground">
                Your key is used only to call your provider. dodomains never
                stores it.
              </p>

              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={saveAndTest}
                  disabled={!canSubmit}
                >
                  {status === "testing" ? "Testing…" : "Save and test"}
                </Button>
                <Button variant="ghost" onClick={clearAll}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
```

Everything renders from `PROVIDERS`. No provider name is hardcoded in the JSX.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify by hand**

Run: `npm run dev`, open http://localhost:3000

Check, in order:

1. The trigger sits beside the GitHub button and looks like it.
2. The panel opens and closes on click, on scrim click, and on Escape.
3. Switching provider swaps the model default and clears the key.
4. The free badge appears for Google, Groq, Mistral and OpenRouter only.
5. Choosing Custom reveals the Base URL field; every other provider hides it.
6. The model datalist shows prices.
7. Pasting a key with a leading space produces no space in the field.
8. Pasting an OpenAI key while Anthropic is selected shows the prefix warning.
9. At a 375px viewport width nothing overflows horizontally.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/components/model-connection.tsx
git add src/components/model-connection.tsx
git commit -m "feat: add model connection button and dropdown"
```

---

### Task 11: Wire the page

**Files:**

- Modify: `src/app/page.tsx`

**Interfaces:**

- Consumes: `ModelConnection`, `useLlmConfig`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Mount the model button**

In the fixed top-right cluster (currently `src/app/page.tsx:225-247`, the `<div className="fixed top-4 right-4 z-50">` holding the GitHub link), wrap the contents in a flex row and put `<ModelConnection />` before the GitHub link:

```tsx
const [connectOpen, setConnectOpen] = useState(false);
const { config } = useLlmConfig();
```

```tsx
<div className="fixed top-4 right-4 z-50 flex items-center gap-2">
  <ModelConnection open={connectOpen} onOpenChange={setConnectOpen} />
  {/* existing GitHub anchor, unchanged */}
</div>
```

- [ ] **Step 2: Send the config with the request**

In `generateDomains` (currently `src/app/page.tsx:158`), read the config from `useLlmConfig()` and add it to the request body:

```tsx
body: JSON.stringify({
  keywords,
  description,
  domainLength: domainLength[0],
  domainStyle,
  tlds: selectedTlds,
  llm: config,
}),
```

Return early if `config` is null. Replace the current `throw new Error("Failed to generate domains")` with reading `{ error, code }` off the response and putting `error` into a new `errorMessage` state that renders above the Generate button in `text-sm text-destructive`. The current `catch` swallows failures behind a comment reading `// Show error message to user` — this is that.

- [ ] **Step 3: Collapse the customize block**

Wrap the existing `Customize Your Domains` section in a native `<details open>`. Move the existing heading text into `<summary>`. Keep the domain length slider, the domain style grid and the TLD tabs exactly as they are — same components, same order, same classes.

Style `<summary>` with `list-none cursor-pointer` and hide the marker with `[&::-webkit-details-marker]:hidden`.

- [ ] **Step 4: Require keywords or a description**

- Change the `Project Description (Optional)` label to `Project Description`.
- Under the description counter, add: `Add keywords or a description — either one is enough.` in `text-xs text-muted-foreground`.
- Compute `const hasInput = keywords.length > 0 || description.trim().length > 0;`
- Generate button behavior:
  - no `config` → label `Connect a model to generate`, `variant="outline"`, onClick opens the dropdown
  - `config` but `!hasInput` → label `Add keywords or a description`, `disabled`
  - otherwise → label `Generate Domain Names`, enabled
- Under the gated button show: `Google, Groq and Mistral all issue a free API key in about a minute.`

The gated button opens the dropdown through the state already lifted in Step 1:

```tsx
<Button
  size="lg"
  className="w-full"
  variant={!config ? "outline" : "default"}
  disabled={Boolean(config) && !hasInput}
  onClick={() => (config ? generateDomains() : setConnectOpen(true))}
>
  {!config
    ? "Connect a model to generate"
    : !hasInput
      ? "Add keywords or a description"
      : "Generate Domain Names"}
</Button>;
{
  !config ? (
    <p className="mt-2 text-center text-xs text-muted-foreground">
      Google, Groq and Mistral all issue a free API key in about a minute.
    </p>
  ) : null;
}
```

- [ ] **Step 5: Update the two false copy lines**

- The card description at `src/app/page.tsx:283` says `our free LLM technology will generate` — the model is the visitor's now. Change to `Enter keywords or describe your project, and the model you connected will generate uniquely creative, available domain names. Our hard-working dodo is standing by!`
- The header bullet `AI-Powered Suggestions` becomes `Any LLM Provider`.
- Leave `100% Free to Use` alone. The tool is still free.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm test && npm run dev`

Check:

1. With no key, Generate reads `Connect a model to generate` and opens the dropdown.
2. With a key and no input, Generate is disabled and reads `Add keywords or a description`.
3. Keywords alone works. Description alone works.
4. `Customize Your Domains` starts open and collapses.
5. A real key end-to-end returns suggestions with availability and affiliate links.
6. A deliberately wrong key shows the mapped message, not a generic failure.
7. At 375px nothing overflows horizontally.

- [ ] **Step 7: Commit**

```bash
npx prettier --write src/app/page.tsx
git add src/app/page.tsx
git commit -m "feat: wire BYO key into the generator page"
```

---

### Task 12: Remove the old stack and update the docs

**Files:**

- Modify: `package.json`, `src/app/layout.tsx`, `README.md`

- [ ] **Step 1: Confirm nothing still imports the old packages**

Run: `grep -rn "openai\|langfuse\|OPENAI_API" src/ README.md next.config.ts`
Expected: no hits in `src/`. If `src/` has any, stop and fix them first.

- [ ] **Step 2: Remove the dependencies**

```bash
npm uninstall openai langfuse
```

- [ ] **Step 3: Update the site metadata**

In `src/app/layout.tsx`, extend the description in both `metadata.description` and `metadata.openGraph.description`:

```
"The first 100% free domain generator to use ChatGPT and other large language models to create highly creative and available domain names for your project. Bring your own API key."
```

Keep every existing keyword. `ChatGPT` and `AI domain generator` are the traffic source and are still accurate.

- [ ] **Step 4: Update the README**

- Under Features, replace `**AI-Powered Suggestions** - Using advanced LLMs for creative domain names` with `**Bring Your Own Key** - Works with OpenAI, Anthropic, Google, Groq, Mistral, DeepSeek, xAI, OpenRouter, or any OpenAI-compatible endpoint`.
- In How It Works, change step 2 to say the model you connect generates the suggestions.
- Add a `### Environment` section listing only `DATABASE_URL` and the PostHog variables. State plainly that no LLM key is needed to run the app, because visitors bring their own.
- Add `Node.js 22.x or later` to Prerequisites, replacing `18.x`.

- [ ] **Step 5: Full verification**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all four green. `npm run build` is the one that catches an `@ai-sdk/*` package leaking into a client component.

- [ ] **Step 6: Commit**

```bash
npx prettier --write package.json src/app/layout.tsx README.md
git add package.json package-lock.json src/app/layout.tsx README.md
git commit -m "chore: drop openai and langfuse, update docs for BYO key"
```

- [ ] **Step 7: Open the pull request**

```bash
git push -u origin feat/byo-llm-key
gh pr create --title "feat: bring your own LLM key" --fill
```

---

## Post-merge, by hand

Not code. Do these in the Vercel dashboard after the deploy is verified working.

1. Confirm generation works on the deployed site with a real key.
2. Set the project's Node.js version to 22.x or later. `ai@7` requires it and Node 20 will fail at runtime.
3. Delete `OPENAI_API_KEY`, `OPENAI_API_MODEL` and every `LANGFUSE_*` variable.

After step 3 the only server secret is `DATABASE_URL`.
