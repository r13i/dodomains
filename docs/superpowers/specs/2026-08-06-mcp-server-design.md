# MCP Server — Design

**Date:** 2026-08-06
**Status:** Draft (pending user review of this doc)
**Depends on:** `2026-08-06-byo-llm-key-design.md` (shipped, PR #3)
**Scope:** A remote MCP server, a `/mcp` landing page, and the copy and metadata changes that come with them.

---

## 1. Goal

dodomains already knows two things a language model does not: which domains are registered, and where to buy the ones that are not. Today that knowledge is reachable only by a human filling in a form.

This adds a **remote MCP endpoint** so a model — Claude, Cursor, ChatGPT, anything speaking MCP — can query it directly, mid-conversation, while helping someone name a project.

**The model does the naming. The tools are pure data.** There is no server-side LLM call anywhere in this spec, and no API key involved. The connected model is already the creative engine; dodomains supplies the facts it cannot know.

That also makes this the natural complement to bring-your-own-key: same database, same affiliate links, no marginal cost, and a second surface that reaches people who never visit the site.

---

## 2. Decisions

| Aspect        | Decision                                                                          |
| ------------- | --------------------------------------------------------------------------------- |
| Transport     | Remote **streamable HTTP** at `/api/mcp`. One URL to add to a client, no install. |
| Library       | `mcp-handler@^2` with peer `@modelcontextprotocol/server@^2`.                     |
| Auth          | **None.** Anonymous, like the website.                                            |
| Abuse control | **Vercel WAF rate limiting** (dashboard) + hard input caps in code.               |
| Tools         | `check_domains`, `score_domain`, `get_registration_links`.                        |
| Zod           | **Bump the repo to zod 4.** Required — see §2.1.                                  |
| Landing page  | `/mcp`, with its own metadata and generated OG image.                             |
| Navbar        | A **Prefer MCP?** button linking to `/mcp`.                                       |

### 2.1 Why the repo must move to zod 4

`@modelcontextprotocol/server@2`'s `registerTool` accepts a **Standard Schema that also exposes JSON Schema** — it needs `~standard.jsonSchema` to advertise the tool's arguments in `tools/list`, and `~standard.validate` to check incoming `tools/call` arguments. **Zod 4 implements both interfaces. Zod 3 does not.**

`ai@7` peer-requires `zod@^3.25.76 || ^4.1.8`, so nothing blocks the bump.

Four files hold schemas today: `src/lib/llm-schema.ts`, both API routes, and `src/lib/generate.ts`. All are small, and all are covered by the existing 72 tests, so a migration break surfaces immediately rather than in production.

The alternative — keeping zod 3 and letting npm nest zod 4 under the MCP package — was rejected. Two copies of zod in one bundle is a footgun: a schema built with one copy silently fails validation in the other, and the failure looks like a data problem, not a dependency problem.

### 2.2 Why Vercel WAF and not Cloudflare or Upstash

Verified against the live site: `dodomains.dev` resolves to `76.76.21.21` with Namecheap nameservers. **There is no Cloudflare in front of it today.**

|                  | Vercel WAF                         | Cloudflare Free             | Upstash                  |
| ---------------- | ---------------------------------- | --------------------------- | ------------------------ |
| Rules            | 1 (Hobby), 40 (Pro)                | 1                           | unlimited                |
| Key on client IP | ✅ IP, JA4                         | ❌ Path + Verified Bot only | ✅                       |
| Setup            | dashboard toggle                   | migrate nameservers         | new account + 2 env vars |
| Cost             | free, 1M allowed requests included | free                        | free tier, then paid     |

Cloudflare's free tier cannot key a rate limit on IP, which is the whole point — it would mean a DNS migration to get something weaker. Upstash puts a third-party service in the request path of an otherwise self-contained app.

Vercel already provides **automatic DDoS mitigation on all plans**, and traffic the WAF blocks does not bill as CDN requests or data transfer, so absorbing an attack costs nothing.

🟡 **Known limitation, deliberately accepted:** Vercel's rate-limit counters are tracked **per region**. A distributed attacker hitting several regions can exceed the configured limit in each one. This is exactly why §5's hard caps exist in code and are not optional.

---

## 3. Architecture

```
src/app/api/mcp/route.ts     the MCP endpoint (POST, and GET for SSE)
src/lib/mcp/tools.ts         the three tool definitions
src/lib/scoring.ts           brandability heuristic — pure, no I/O
src/app/mcp/page.tsx         the landing page
src/app/mcp/opengraph-image.tsx
```

`src/lib/domains.ts` is imported unchanged. **The website and the MCP server must resolve availability through the identical function** — that was the reason it was extracted in the previous spec, and it is what stops the two surfaces disagreeing about whether a domain is free.

### 3.1 The route

```ts
import { createMcpRouteHandler } from "mcp-handler";

const handler = createMcpRouteHandler(
  (server) => {
    registerTools(server);
  },
  { serverInfo: { name: "dodomains", version: "1.0.0" } },
);

export { handler as GET, handler as POST };
export const maxDuration = 30;
```

`createMcpRouteHandler` returns a web-standard `(request: Request) => Promise<Response>`, which is exactly a Next.js route handler. Stateless — no Redis, no session store.

---

## 4. Tools

Each tool's description is written for a model, not a person. It states plainly what the tool knows and what it does not, because a tool description that oversells gets called in the wrong situations.

### 4.1 `check_domains`

The core tool. Takes 1–100 domains, returns registration status for each in **one** database query.

```ts
inputSchema: z.object({
  domains: z
    .array(z.string().min(3).max(253))
    .min(1)
    .max(100)
    .describe(
      "Full domain names including TLD, e.g. ['inkslot.com', 'needlebook.io']",
    ),
});
```

Returns, per domain: `{ domain, available, registrationUrls? }`.

**The description must carry the caveat**, verbatim in substance: _available means "not present in our snapshot of registered domains", which is not an authoritative registry check._ A model that believes this is WHOIS will tell someone a taken domain is free.

The 100 cap is the batch limit, and it is what makes the tool worth calling: a model brainstorms sixty names and filters them in a single round trip.

### 4.2 `score_domain`

A deterministic brandability score, 0–100, with a breakdown. No database, no network, no model.

```ts
inputSchema: z.object({
  domain: z.string().min(3).max(253),
});
```

Returns `{ score, breakdown: { length, pronounceability, hyphens, digits, tldTier, typoRisk }, notes: string[] }`.

The heuristic, fully specified so it is reproducible:

| Factor             | Rule                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------- |
| `length`           | Name part excluding TLD. 4–10 chars scores full; each char beyond 12 subtracts.       |
| `pronounceability` | Penalise consonant runs of 4+, and any name with no vowel.                            |
| `hyphens`          | Any hyphen is a penalty; two or more is a heavy one.                                  |
| `digits`           | Digits penalised; digits mixed mid-word penalised harder (`4` for `for`).             |
| `tldTier`          | `.com` top; `.io/.dev/.app/.ai/.co` second; everything else third.                    |
| `typoRisk`         | Doubled letters at a word seam (`newssite`), and homoglyph pairs (`rn`/`m`, `l`/`I`). |

This exists so a model has an objective tiebreaker instead of vibes. It is a heuristic and its description says so.

### 4.3 `get_registration_links`

Returns GoDaddy and Namecheap URLs for a domain, using the existing `affiliateLinksFor` in `src/lib/domains.ts`.

This is the only revenue path on this surface, and it is why the affiliate builder was extracted rather than inlined.

---

## 5. Abuse control

Two layers. The WAF is configured outside the repo, so the code layer must stand alone.

**In code, non-negotiable:**

- `domains` array capped at 100, enforced by the schema, not by a runtime check.
- Each domain capped at 253 characters — the DNS maximum.
- `maxDuration = 30` on the route.
- The database user remains **SELECT-only**. Nothing in this spec writes. `README-postgres.md`'s hardening stands unchanged.

**In the Vercel dashboard, by hand after merge:**

- One WAF rate-limit rule: path `/api/mcp`, key on IP, fixed window. Start at **60 requests / 60s**, action **Deny (429)**.
- Set it to **Log** first for a few days, read the Firewall overview, then switch to Deny. Shipping straight to Deny risks blocking a legitimate agent that batches aggressively.

---

## 6. The `/mcp` page

A real landing page, not a README dump. It has to do three jobs: explain what this is to someone who has never used MCP, hand over the URL, and show the exact config to paste.

**Sections, in order:**

1. **Hero** — what it is in one line, and the endpoint on display: `https://dodomains.dev/api/mcp`, in mono, with a copy button that confirms it copied.
2. **Setup** — tabs for Claude Code, Claude Desktop, and Cursor. Each shows the exact command or JSON, each with its own copy button. Claude Code is a one-liner (`claude mcp add --transport http dodomains https://dodomains.dev/api/mcp`); the desktop clients take a JSON block.
3. **Tools** — the three tools, each with its name in mono, one sentence on what it does, and a concrete example of when a model would reach for it.
4. **Honesty note** — the same snapshot caveat as the tool description. It belongs on the page too, not just in the protocol.
5. **Back to the generator** — a link home, so the two surfaces cross-refer.

The page reuses the existing visual language: same tokens, `Waves` background, glass `Card`, Geist Sans with Geist Mono for anything machine-readable. **No new design system.**

### 6.1 Navbar

A **Prefer MCP?** button joins the fixed top-right cluster, styled like the existing GitHub link, linking to `/mcp`. On the `/mcp` page itself it is replaced by a link back to the generator.

---

## 7. Copy and metadata

`src/lib/site.ts` is the single source of truth and gains MCP-aware entries. **No string literal may be duplicated into a component.**

| Where                             | Change                                                                                                                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/site.ts`                 | Add `MCP_TAGLINE` and `MCP_DESCRIPTION`. `TAGLINE` itself is unchanged — the homepage is still the generator.                                            |
| `src/app/mcp/page.tsx`            | `export const metadata` with its own title, description and canonical `/mcp`.                                                                            |
| `src/app/mcp/opengraph-image.tsx` | Its own generated card, rendered from `MCP_TAGLINE` through the shared `renderOgImage` helper, which grows a `tagline` parameter. Still no static image. |
| Homepage                          | One line in the "Why Choose" list: the model can query dodomains directly over MCP.                                                                      |
| `README.md`                       | An MCP section with the endpoint and the three client configs.                                                                                           |
| JSON-LD                           | Extend the existing `WebApplication` block with the `/mcp` page as a `SoftwareApplication` offering.                                                     |

`renderOgImage()` currently hardcodes `TAGLINE`. It becomes `renderOgImage(tagline: string)` so both pages share one renderer and neither can drift.

---

## 8. Testing

Vitest, unit only, consistent with the existing suite.

| Target       | Assertions                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scoring.ts` | Table-driven: `.com` short word beats hyphenated; digits and hyphens reduce score; no-vowel names penalised; score always within 0–100; identical input is deterministic. |
| `tools.ts`   | Each tool returns the documented shape. `check_domains` maps registered and unregistered correctly with a mocked pool, and returns links only for available domains.      |
| input caps   | 101 domains rejected by the schema; 0 domains rejected; a 254-character domain rejected.                                                                                  |
| `route.ts`   | A `tools/list` request lists exactly three tools with non-empty descriptions.                                                                                             |

Out of scope: a live MCP client handshake. That is manual verification in §9.

---

## 9. Rollout

1. Merge.
2. **Vercel dashboard:** add the WAF rate-limit rule from §5 in **Log** mode.
3. Add the server to a real client and exercise every tool: `claude mcp add --transport http dodomains https://dodomains.dev/api/mcp`. No unit test covers the protocol handshake.
4. Verify `/mcp` renders, both copy buttons work, and the OG card generates at `/mcp/opengraph-image`.
5. After a few days of traffic, switch the WAF rule to **Deny**.

---

## 10. Out of scope

- **Authentication and per-user quotas.** `mcp-handler` ships `withMcpAuth`, so this stays open if it is ever needed.
- **A `find_available_variants` tool.** Considered during brainstorming and cut: the model can generate variants itself and batch them through `check_domains`.
- **Writing anything to the database.** The SELECT-only grant is a feature.
- **PostHog events for MCP tool calls.** Same standing follow-up as the website.
