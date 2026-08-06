# Bring Your Own LLM Key — Design

**Date:** 2026-08-06
**Status:** Approved (pending user review of this doc)
**Scope:** Replace the operator-owned OpenAI call with a user-supplied API key for any provider. The MCP server is a **separate spec** and is out of scope here.

---

## 1. Goal & positioning

Today `/api/generate` calls OpenAI with `process.env.OPENAI_API_KEY`. Every generation costs the operator money, which caps how much the site can be used and forced the (never-built) credit-pack plan.

This design removes the operator's LLM cost entirely. The visitor connects their own key from any provider; dodomains contributes the prompt, the availability check against the registered-domain database, and the affiliate links.

**Positioning stays "100% free".** The tool is free. The visitor pays their own provider at cost, and free API keys exist (Google, Groq, Mistral, OpenRouter), so a visitor can go from landing to generating without paying anyone.

### Decisions this supersedes

`docs/superpowers/specs/2026-07-02-monetization-credit-packs-design.md` is **killed**, not deferred. With no operator marginal cost there is nothing to meter. No Better Auth, no Stripe, no credit ledger, no anonymous-trial counter, no `user`/`session`/`credit_ledger`/`anon_usage` tables. Affiliate links to GoDaddy and Namecheap remain the only revenue.

---

## 2. Decisions

| Aspect               | Decision                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Key storage          | Browser `localStorage`, key `dodomains.llm.v1`.                                                             |
| Transport            | **Server proxy.** The key is sent with each request, used in memory, never persisted or logged server-side. |
| Provider coverage    | Curated list of eight, plus a Custom OpenAI-compatible row.                                                 |
| Multi-provider layer | **Vercel AI SDK v7** (`ai@^7` + `@ai-sdk/*@^4`), `generateText` with `Output.object` and a zod schema.      |
| No-key visitor       | **Hard gate.** No key means no generation. The UI leads with providers that issue a free key.               |
| Model selection      | Combobox: seeded list with prices, free text always accepted.                                               |
| Observability        | `langfuse` removed. Tracing prompts that run on a visitor's own key is not a claim we want to make.         |
| Tests                | Vitest, unit only.                                                                                          |

### Why server proxy and not browser-direct

Browser-direct would let the UI claim the key never touches our servers. It was rejected because provider CORS support is uneven (Anthropic requires an explicit dangerous-direct-browser-access header, several providers block browser origins outright), and the availability check needs a second round-trip to our API regardless.

**Consequence for copy:** the UI must not say the key goes "directly" to the provider, because it does not. The approved wording is:

> Your key is used only to call your provider. dodomains never stores it.

This is accurate, reassuring, and free of implementation detail.

---

## 3. Architecture

Next.js 15 App Router, unchanged. The route handler becomes thin glue over four modules.

```
src/lib/providers.ts          isomorphic metadata — no SDK imports
src/lib/providers.server.ts   factory map — imports the @ai-sdk/* packages
src/lib/generate.ts           prompt construction + generateObject
src/lib/domains.ts            availability + affiliate links   ← reused by the MCP spec
src/app/api/generate/route.ts validate → generate → check → respond
src/app/api/test-connection/route.ts  one cheap call to validate key + model
```

### 3.1 The registry split

`providers.ts` holds data only, so the client can import it to render the picker:

```ts
export type ProviderMeta = {
  id: string;
  label: string;
  free: boolean; // issues a usable free API key
  keyPrefix: string; // "" when the provider has no stable prefix
  keyHost: string; // where to get a key, e.g. "console.groq.com"
  gateway: boolean; // namespaces model ids itself (Groq, OpenRouter)
  needsBaseUrl: boolean; // custom only
  models: Array<{ id: string; in: number; out: number }>; // USD per MTok
};
```

`providers.server.ts` holds `Record<string, (o: { apiKey: string; baseUrl?: string }) => LanguageModel>` and imports the SDKs.

**This split is load-bearing.** Without it, nine provider SDKs land in the browser bundle. Adding a provider is one row in each file.

### 3.2 Provider list

Free-key providers are listed first, and the field shows an **"Allows free API key"** badge.

| id           | Label                      | Free key | Key prefix | Gateway |
| ------------ | -------------------------- | -------- | ---------- | ------- |
| `google`     | Google Gemini              | yes      | `AIza`     | no      |
| `groq`       | Groq                       | yes      | `gsk_`     | **yes** |
| `mistral`    | Mistral                    | yes      | —          | no      |
| `openrouter` | OpenRouter                 | yes      | `sk-or-`   | **yes** |
| `openai`     | OpenAI                     | no       | `sk-`      | no      |
| `anthropic`  | Anthropic                  | no       | `sk-ant-`  | no      |
| `deepseek`   | DeepSeek                   | no       | `sk-`      | no      |
| `xai`        | xAI Grok                   | no       | `xai-`     | no      |
| `custom`     | Custom (OpenAI-compatible) | no       | —          | no      |

### 3.3 Model list

Seeded from **https://hail.so/costs.md**, which gives canonical model ids with input/output price per MTok. The combobox shows `gpt-5-mini` next to `$0.25 / $2.00`, and the Model field links to https://hail.so/costs.

Defaults: `gemini-2.5-flash`, `mistral-small-2603`, `gpt-5-nano`, `claude-sonnet-5`, `deepseek-chat`, `grok-code-fast-1`.

**Gateways are seeded thinly on purpose.** `hail.so/costs.md` lists vendor-canonical names (`llama-4-scout`), but Groq and OpenRouter namespace their own (`meta-llama/llama-4-scout-17b-16e-instruct`). Seeding those from hail would hand users ids that 404. For `gateway: true` providers the hint reads _"Groq uses its own model ids. Copy the exact id from console.groq.com."_

The field is always free text, so a model released today works today.

### 3.4 Request contract

`POST /api/generate` gains one field:

```ts
llm: {
  provider: string;   // must exist in the registry
  model: string;      // 1–100 chars
  apiKey: string;     // 1–500 chars
  baseUrl?: string;   // required when provider === "custom", must be http(s)
}
```

`apiKey` is destructured straight into the factory. It is never logged, never persisted, and never echoed in a response.

### 3.5 Structured output

```ts
import { generateText, Output } from "ai";

const { output } = await generateText({
  model,
  output: Output.object({ schema: domainSuggestionSchema }),
  instructions: SYSTEM_PROMPT,
  prompt: buildPrompt(params),
});
```

against:

```ts
z.object({
  domains: z
    .array(z.object({ name: z.string(), tld: z.string() }))
    .min(5)
    .max(10),
});
```

The AI SDK selects the right mechanism per provider (OpenAI `json_schema`, Anthropic forced tool call, Gemini `responseSchema`). This replaces `JSON.parse(response.choices[0].message.content || "{}")`, which today yields `{}` on a malformed reply and then throws inside `checkDomainAvailability`.

**Why not `generateObject`.** It is `@deprecated` in v7 in favour of `generateText` with an `output` setting. Note the result is on `.output`, not `.object`.

### 3.5.1 Version facts that constrain the implementation

Verified against the installed v7 tree, not from documentation:

| Fact                                                                                    | Consequence                                                                                                                |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ai@7` declares `engines.node >= 22` and is ESM-only                                    | Add `"engines": { "node": ">=22" }`; the Vercel project must not run Node 20.                                              |
| `ai@7` peer-requires `zod@^3.25.76 \|\| ^4.1.8`                                         | The repo's `zod@^3.24.2` is **below the floor**. Bump to `^3.25.76` — stays on zod 3, no schema rewrites.                  |
| `system` is deprecated in favour of `instructions`                                      | Use `instructions`.                                                                                                        |
| `@ai-sdk/google` exports `createGoogle`; `createGoogleGenerativeAI` is a retained alias | Use `createGoogle`.                                                                                                        |
| `createOpenAI(...)(id)` targets the **Responses** API                                   | Use `.chat(id)` — Chat Completions is available on every OpenAI account tier, which matters when the key is the visitor's. |
| `@ai-sdk/openai-compatible` requires both `name` and `baseURL`                          | The `custom` factory must pass both.                                                                                       |
| A retryable `APICallError` surfaces wrapped in `RetryError`                             | The error mapper must unwrap `RetryError.errors[]` before reading `.statusCode`.                                           |
| Mock class is `MockLanguageModelV4` (V2 is gone)                                        | Tests use `MockLanguageModelV4` from `ai/test`.                                                                            |
| Provider-level `finishReason` is `{ unified, raw }` and `usage` is nested               | Test fixtures must use the object forms. A bare `'stop'` string does not throw — it silently yields `undefined`.           |
| `ai/test` no longer needs `msw`                                                         | Do not add `msw`.                                                                                                          |

### 3.6 Error mapping

Provider failures map to a code plus a sanitized message. Raw provider bodies never reach the client — they can carry organization identifiers.

| Condition             | Code                   | UI response                        |
| --------------------- | ---------------------- | ---------------------------------- |
| 401 / 403             | `invalid_key`          | Open dropdown, focus key field     |
| unknown model         | `bad_model`            | Open dropdown, focus model field   |
| quota exhausted / 402 | `no_credit`            | Offer switching to a free provider |
| 429                   | `rate_limited`         | Retry, key untouched               |
| DNS / bad base URL    | `provider_unreachable` | Open dropdown, focus base URL      |
| anything else         | `provider_error`       | Generic message                    |

### 3.7 Availability check

`checkAvailability()` and the affiliate-link builder move out of the route into `src/lib/domains.ts` with behavior unchanged, including the current fallback: if the database query throws, every domain is reported available. The MCP spec imports the same functions, so the website and the MCP server cannot drift.

No database schema change. `domains` stays a single `SELECT`-only table.

---

## 4. UI

The existing visual system is unchanged: shadcn tokens from `src/app/globals.css`, Geist Sans and Geist Mono, the `Waves` canvas background, the glass `Card`, the 192px logo hero. No new colors, no new fonts, no new layout language.

Mockup: `docs/superpowers/specs/assets/2026-08-06-byo-key-mockup.html`

### 4.1 Model button

The fixed top-right cluster in `src/app/page.tsx` currently holds one GitHub link. A model button joins it, styled identically (`bg-background/80 backdrop-blur-sm border-2 border-border/70 rounded-md px-3 py-1.5 text-sm`).

| State     | Content                                    |
| --------- | ------------------------------------------ |
| Unset     | grey dot · `Connect model`                 |
| Connected | teal dot · `OpenAI` · `gpt-5-mini` in mono |
| Testing   | pulsing dot · `Testing…`                   |
| Failed    | red dot · `Key rejected`                   |

Below `38rem` the model id is hidden and the label truncates.

### 4.2 Dropdown

Anchored under the button, `24rem` wide, full-width minus gutters below `30rem`. Closes on Escape and on scrim click. Contents in order:

1. Title and one-line explanation.
2. Error alert, when a code is set.
3. **Provider** select, with the "Allows free API key" badge beside the label.
4. **Model** combobox with prices, and a `Compare prices ↗` link to https://hail.so/costs.
5. **Base URL**, shown only for `custom`.
6. **API key** password field with a show/hide toggle.
7. The assurance line from §2.
8. `Save and test` and `Clear`.

**Typography rule:** human text is Geist Sans; every machine value — model id, key, base URL, price, domain ending — is Geist Mono. This is the only new typographic convention and it costs nothing.

### 4.3 Key field behavior

- **Paste hygiene:** whitespace and stray quotes are stripped on input. This is the most common cause of a "wrong key" that is actually a correct key.
- **Format check:** compared against `keyPrefix`; a mismatch shows _"Anthropic keys start with `sk-ant-`. Check you copied all of it."_ It is a hint, never a block.
- **Never prefilled** from a previous provider's key.

### 4.4 Save and test

`POST /api/test-connection` runs `generateText({ model, prompt: "ok", maxOutputTokens: 1 })`. It costs the user a fraction of a cent and surfaces all five error codes at setup time instead of mid-generation. On success the config is written to `localStorage` and the dropdown closes.

### 4.5 Generator form

- `Project Description (Optional)` becomes `Project Description`, with the line _"Add keywords or a description — either one is enough."_
- `Customize Your Domains` becomes a `<details open>`. Same heading, same contents, same order — domain length, domain style, extension tabs.
- Generate button states: no key → `Connect a model to generate` (outline, opens the dropdown); key but no input → `Add keywords or a description` (disabled); ready → `Generate Domain Names`.
- Under the gated button: _"Google, Groq and Mistral all issue a free API key in about a minute."_

### 4.6 Copy changes forced by BYO key

| Location                    | Change                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `page.tsx` card description | Drop _"our free LLM technology"_ — it is the visitor's model now.                                                                 |
| `page.tsx` bullets          | `AI-Powered Suggestions` → `Any LLM Provider`                                                                                     |
| `layout.tsx` metadata       | Add "bring your own API key" to the description. Keep the ChatGPT and LLM keywords — still accurate and still the traffic source. |
| `README.md`                 | Document the BYO-key setup; remove `OPENAI_API_KEY` from prerequisites.                                                           |

`100% Free to Use` stays. The tool is free.

---

## 5. Validation

The request schema gains a cross-field rule:

```ts
.refine(
  (d) => d.keywords.length > 0 || (d.description ?? "").trim().length > 0,
  { message: "Provide keywords or a description" },
)
```

The `.min(1)` constraint on `keywords` is removed; `.max(5)` and the per-keyword `.max(30)` stay, and `description` stays `.max(300)`. The same rule gates the button client-side, so the 400 is a backstop rather than the primary UX.

---

## 6. Testing

Vitest, unit only. No browser tests, no E2E, no real provider calls.

| Target              | Assertions                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Registry            | Every metadata id has a factory and vice versa; ids unique; no empty seeded model ids.                                               |
| `buildPrompt`       | Four branches: user-selected TLDs, model-picks-TLDs, keywords only, description only.                                                |
| `generateDomains`   | Runs against the AI SDK's `MockLanguageModelV4`. No network, no key.                                                                 |
| Error mapping       | Table-driven: provider error shape → one of the six codes.                                                                           |
| `checkAvailability` | Mocked `pg` pool: registered vs not, case-insensitive match, affiliate links only when available, DB error → all reported available. |
| Request schema      | Neither keywords nor description → 400; keywords only → ok; description only → ok; both → ok.                                        |
| `/api/generate`     | A body with no `llm` returns 400 and never constructs a provider.                                                                    |

---

## 7. Files touched

**Added**

- `src/lib/providers.ts`, `src/lib/providers.server.ts`
- `src/lib/generate.ts`, `src/lib/domains.ts`
- `src/app/api/test-connection/route.ts`
- `src/components/model-connection.tsx` — the button and dropdown
- `src/hooks/use-llm-config.ts` — read/write `localStorage`, guard against a bad stored shape
- `src/lib/llm-errors.ts` — provider error → code mapping
- `vitest.config.mts` and `src/**/*.test.ts` (`.mts`, because the repo has no `"type": "module"`)

**Modified**

- `src/app/api/generate/route.ts` — thin glue, new schema, error mapping
- `src/app/page.tsx` — model button, Advanced collapse, validation, copy
- `src/app/layout.tsx` — metadata description
- `README.md`, `package.json`

**Deleted**

- `openai` and `langfuse` dependencies
- `OPENAI_API_KEY`, `OPENAI_API_MODEL`, `LANGFUSE_*` env vars, in code and in Vercel

---

## 8. Rollout

One pull request. Removing the server key and adding BYO must land together, or generation breaks between deploys.

1. Merge the PR.
2. Confirm generation works on the deployed site with a real key.
3. Delete `OPENAI_API_KEY`, `OPENAI_API_MODEL` and `LANGFUSE_*` from the Vercel project.

After step 3 the only server secret is `DATABASE_URL`.

---

## 9. Out of scope

- **The MCP server.** Separate spec: a remote streamable-HTTP endpoint at `/api/mcp` with `check_domains`, `score_domain` and `get_registration_links`, anonymous with an IP rate limit, importing `src/lib/domains.ts`. Build after this ships.
- **PostHog events for provider and model choice.** Useful for knowing which providers people actually use, but unrequested. Propose separately.
- **Streaming responses.** The current request/response shape is kept.
- **Syncing the key across devices.** Browser-local by design.
