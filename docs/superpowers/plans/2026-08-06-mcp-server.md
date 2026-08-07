# MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a remote MCP server at `/api/mcp` with three tools, a `/mcp` landing page, and the copy and metadata that go with them.

**Architecture:** `mcp-handler` mounts a stateless streamable-HTTP handler as a Next.js route. Three tools sit behind it: two thin wrappers over the existing `src/lib/domains.ts`, and one pure scoring heuristic. The landing page and its generated OG card reuse the site's existing renderer, parameterised so both pages share one implementation.

**Tech Stack:** Next.js 15, React 19, Tailwind 4, `mcp-handler@2`, `@modelcontextprotocol/server@2`, **zod 4**, Vitest 4.

**Spec:** `docs/superpowers/specs/2026-08-06-mcp-server-design.md`

## Global Constraints

- **The database user is SELECT-only and stays that way.** Nothing in this plan writes to Postgres.
- **`src/lib/domains.ts` is imported, never reimplemented.** The website and MCP must resolve availability through the identical function.
- **No server-side LLM call.** No API key is involved anywhere in this plan.
- **Input caps live in the zod schema, not in runtime `if` checks** — `domains` max 100, each domain max 253 chars.
- **No static OG image.** Cards are generated from constants in `src/lib/site.ts`.
- **No new design system.** Use the tokens in `src/app/globals.css` and the existing shadcn components. Geist Sans for prose, Geist Mono for anything machine-readable.
- **No string literal duplicated between `src/lib/site.ts` and a component.**
- **zod 4** across the whole repo. Do not leave a mixed install.
- Path alias is `@/src/*`. Prettier is in use.
- **Every task ends with `npm test`, `npx tsc --noEmit`, AND `npm run build` green.** The build is not optional — it is the only gate that catches an illegal route export or a server-only import reaching a client component.

---

### Task 1: Zod 4 migration and MCP dependencies

**Files:**

- Modify: `package.json`, `src/lib/llm-schema.ts`, `src/app/api/generate/route.ts`, `src/app/api/test-connection/route.ts`, `src/lib/generate.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: a repo on zod 4 with `mcp-handler` installed. Every later task depends on it.

- [ ] **Step 1: Install**

```bash
npm install zod@^4.4.3 mcp-handler@^2.1.0 @modelcontextprotocol/server@^2.0.0
```

- [ ] **Step 2: Run the suite to see what zod 4 broke**

Run: `npm test && npx tsc --noEmit`

Record every failure before changing anything. The four schema files are the only places zod is used.

- [ ] **Step 3: Apply the known zod 4 migrations**

These are the changes most likely to bite this codebase:

| zod 3                             | zod 4                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ |
| `z.string().url()`                | `z.url()` — the method form is deprecated                                |
| `.refine(fn, { message: "..." })` | `.refine(fn, { error: "..." })` — `message` is deprecated                |
| `error.format()`                  | still present but deprecated; `z.treeifyError(error)` is the replacement |

`src/app/api/generate/route.ts` returns `details: parsed.error.format()` to the client. If `format()` is gone, switch to `z.treeifyError(parsed.error)`. **Whatever you choose, the shape must stay an object and must not begin echoing submitted values** — there is a test asserting the API key never appears in a response, and it must keep passing.

Do not restructure a schema to make an error go away. Fix the call, keep the constraint.

- [ ] **Step 4: Verify**

```bash
npm test && npx tsc --noEmit && npm run build && npm run lint
```

All four green. 72 tests must still pass — if a test now fails, the migration is wrong, not the test.

- [ ] **Step 5: Confirm there is only one zod**

Run: `npm ls zod`
Expected: a single zod 4 entry. If `@modelcontextprotocol/server` still nests its own copy, say so in your report — it means the hoist did not take.

- [ ] **Step 6: Commit**

```bash
npx prettier --write package.json src/
git add package.json package-lock.json src/
git commit -m "chore: migrate to zod 4, add mcp-handler"
```

---

### Task 2: Domain scoring heuristic

**Files:**

- Create: `src/lib/scoring.ts`
- Test: `src/lib/scoring.test.ts`

**Interfaces:**

- Consumes: nothing. Pure function, no I/O.
- Produces:
  - `type ScoreBreakdown = { length: number; pronounceability: number; hyphens: number; digits: number; tldTier: number; typoRisk: number }`
  - `type DomainScore = { domain: string; score: number; breakdown: ScoreBreakdown; notes: string[] }`
  - `function scoreDomain(domain: string): DomainScore`

The six factors sum to exactly 100 at their maxima: 25 + 25 + 15 + 15 + 15 + 5.

- [ ] **Step 1: Write the failing test**

Create `src/lib/scoring.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { scoreDomain } from "@/src/lib/scoring";

describe("scoreDomain", () => {
  it("gives a short .com word close to full marks", () => {
    const r = scoreDomain("inkslot.com");
    expect(r.score).toBeGreaterThan(85);
    expect(r.breakdown.hyphens).toBe(15);
    expect(r.breakdown.digits).toBe(15);
    expect(r.breakdown.tldTier).toBe(15);
  });

  it("penalises hyphens", () => {
    expect(scoreDomain("ink-slot.com").score).toBeLessThan(
      scoreDomain("inkslot.com").score,
    );
    expect(scoreDomain("ink-slot-book.com").breakdown.hyphens).toBe(0);
  });

  it("penalises digits, and mid-word digits harder", () => {
    const trailing = scoreDomain("inkslot7.com").breakdown.digits;
    const middle = scoreDomain("ink5lot.com").breakdown.digits;
    expect(trailing).toBeLessThan(15);
    expect(middle).toBeLessThan(trailing);
  });

  it("penalises a name with no vowel", () => {
    expect(scoreDomain("bxdfgh.com").breakdown.pronounceability).toBeLessThan(
      scoreDomain("inkslot.com").breakdown.pronounceability,
    );
  });

  it("penalises long consonant runs", () => {
    expect(
      scoreDomain("angstschrift.com").breakdown.pronounceability,
    ).toBeLessThan(25);
  });

  it("ranks .com above a second-tier tld above the long tail", () => {
    const com = scoreDomain("inkslot.com").breakdown.tldTier;
    const io = scoreDomain("inkslot.io").breakdown.tldTier;
    const xyz = scoreDomain("inkslot.xyz").breakdown.tldTier;
    expect(com).toBeGreaterThan(io);
    expect(io).toBeGreaterThan(xyz);
  });

  it("penalises very long names", () => {
    expect(
      scoreDomain("theverylongestdomainnameever.com").breakdown.length,
    ).toBeLessThan(scoreDomain("inkslot.com").breakdown.length);
  });

  it("flags homoglyph typo risk", () => {
    expect(scoreDomain("modern.com").breakdown.typoRisk).toBeLessThan(5);
  });

  it("always returns a score between 0 and 100", () => {
    for (const d of [
      "a.com",
      "inkslot.com",
      "x-y-z-1-2-3.museum",
      "bxdfghjklmnpqrst.xyz",
      "the-very-longest-hyphenated-name-anyone-has-tried.co.uk",
    ]) {
      const r = scoreDomain(d);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic", () => {
    expect(scoreDomain("inkslot.com")).toEqual(scoreDomain("inkslot.com"));
  });

  it("explains every penalty it applies", () => {
    const r = scoreDomain("ink-5lot.xyz");
    expect(r.notes.length).toBeGreaterThan(0);
    expect(r.notes.join(" ")).toMatch(/hyphen/i);
  });

  it("handles a domain with no dot without throwing", () => {
    expect(() => scoreDomain("nodot")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- scoring`
Expected: FAIL — cannot resolve `@/src/lib/scoring`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/scoring.ts`:

```ts
/**
 * A deterministic brandability heuristic. No database, no network, no model.
 *
 * It exists so a language model has an objective tiebreaker between candidate
 * names instead of guessing. It is a heuristic, not a judgement — the tool
 * description says so, and so does this comment.
 *
 * The six factors sum to 100 at their maxima: 25 + 25 + 15 + 15 + 15 + 5.
 */

export type ScoreBreakdown = {
  length: number;
  pronounceability: number;
  hyphens: number;
  digits: number;
  tldTier: number;
  typoRisk: number;
};

export type DomainScore = {
  domain: string;
  score: number;
  breakdown: ScoreBreakdown;
  notes: string[];
};

const TOP_TLD = ["com"];
const SECOND_TIER_TLD = ["io", "dev", "app", "ai", "co", "net", "org"];

const VOWELS = /[aeiouy]/;
const CONSONANT_RUN_4 = /[^aeiouy0-9-]{4,}/;
const CONSONANT_RUN_3 = /[^aeiouy0-9-]{3}/;
const HOMOGLYPHS = ["rn", "vv", "cl"];

function splitDomain(domain: string): { name: string; tld: string } {
  const lower = domain.trim().toLowerCase();
  const dot = lower.indexOf(".");
  if (dot === -1) return { name: lower, tld: "" };
  return { name: lower.slice(0, dot), tld: lower.slice(dot + 1) };
}

function scoreLength(name: string, notes: string[]): number {
  const n = name.length;
  if (n >= 4 && n <= 10) return 25;
  if (n < 4) {
    notes.push("Very short names are memorable but rarely available.");
    return 22;
  }
  if (n <= 12) return 20;
  if (n <= 15) {
    notes.push(`${n} characters is long enough to be misremembered.`);
    return 14;
  }
  if (n <= 20) {
    notes.push(`${n} characters is hard to type and hard to say aloud.`);
    return 8;
  }
  notes.push(`${n} characters is too long for a memorable brand.`);
  return 3;
}

function scorePronounceability(name: string, notes: string[]): number {
  let score = 25;
  if (!VOWELS.test(name)) {
    notes.push("No vowel, so the name cannot be pronounced as written.");
    score -= 15;
  }
  if (CONSONANT_RUN_4.test(name)) {
    notes.push("A run of four or more consonants makes this hard to say.");
    score -= 10;
  } else if (CONSONANT_RUN_3.test(name)) {
    score -= 5;
  }
  return Math.max(0, score);
}

function scoreHyphens(name: string, notes: string[]): number {
  const count = (name.match(/-/g) ?? []).length;
  if (count === 0) return 15;
  if (count === 1) {
    notes.push(
      "A hyphen has to be spoken aloud every time the name is shared.",
    );
    return 7;
  }
  notes.push("Multiple hyphens read as spam and are easily mistyped.");
  return 0;
}

function scoreDigits(name: string, notes: string[]): number {
  if (!/\d/.test(name)) return 15;
  if (/^[^\d]+\d+$/.test(name)) {
    notes.push("A trailing digit is often heard as a different word.");
    return 8;
  }
  notes.push("Digits inside a word are ambiguous when spoken aloud.");
  return 3;
}

function scoreTld(tld: string, notes: string[]): number {
  if (TOP_TLD.includes(tld)) return 15;
  if (SECOND_TIER_TLD.includes(tld)) return 11;
  notes.push(`.${tld} is outside the endings most people assume by default.`);
  return 6;
}

function scoreTypoRisk(name: string, notes: string[]): number {
  let score = 5;
  for (const pair of HOMOGLYPHS) {
    if (name.includes(pair)) {
      notes.push(`"${pair}" is easily misread at small sizes.`);
      score -= 2;
      break;
    }
  }
  if (/(.)\1\1/.test(name)) {
    notes.push("Three identical letters in a row invite a typo.");
    score -= 2;
  }
  return Math.max(0, score);
}

export function scoreDomain(domain: string): DomainScore {
  const { name, tld } = splitDomain(domain);
  const notes: string[] = [];

  const breakdown: ScoreBreakdown = {
    length: scoreLength(name, notes),
    pronounceability: scorePronounceability(name, notes),
    hyphens: scoreHyphens(name, notes),
    digits: scoreDigits(name, notes),
    tldTier: scoreTld(tld, notes),
    typoRisk: scoreTypoRisk(name, notes),
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    domain: domain.trim().toLowerCase(),
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    notes,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- scoring`
Expected: PASS, 12 tests.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && npm run build
npx prettier --write src/lib/scoring.ts src/lib/scoring.test.ts
git add src/lib/scoring.ts src/lib/scoring.test.ts
git commit -m "feat: add deterministic domain scoring heuristic"
```

---

### Task 3: MCP tool definitions

**Files:**

- Create: `src/lib/mcp/tools.ts`
- Test: `src/lib/mcp/tools.test.ts`

**Interfaces:**

- Consumes: `checkAvailability`, `affiliateLinksFor` from `@/src/lib/domains`; `scoreDomain` from `@/src/lib/scoring`.
- Produces:
  - `const CHECK_DOMAINS_INPUT`, `const SCORE_DOMAIN_INPUT`, `const REGISTRATION_LINKS_INPUT` — zod 4 schemas
  - `async function checkDomainsTool(args): Promise<{ results: Array<{ domain: string; available: boolean; registrationUrls: { godaddy: string; namecheap: string } | null }> }>`
  - `function scoreDomainTool(args): DomainScore`
  - `function registrationLinksTool(args): { domain: string; godaddy: string; namecheap: string }`
  - `function registerTools(server: McpServer): void`

Tool handlers are exported separately from `registerTools` so they can be tested without standing up a server.

**`checkAvailability` takes `{ name, tld }[]`, not full domain strings.** Split each input domain at the first dot before calling it, and reject anything with no dot.

- [ ] **Step 1: Write the failing test**

Create `src/lib/mcp/tools.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/src/lib/db", () => ({ default: { query } }));

import {
  CHECK_DOMAINS_INPUT,
  checkDomainsTool,
  registrationLinksTool,
  scoreDomainTool,
} from "@/src/lib/mcp/tools";

beforeEach(() => query.mockReset());

describe("check_domains input schema", () => {
  it("rejects an empty list", () => {
    expect(CHECK_DOMAINS_INPUT.safeParse({ domains: [] }).success).toBe(false);
  });

  it("rejects more than 100 domains", () => {
    const domains = Array.from({ length: 101 }, (_, i) => `n${i}.com`);
    expect(CHECK_DOMAINS_INPUT.safeParse({ domains }).success).toBe(false);
  });

  it("accepts exactly 100 domains", () => {
    const domains = Array.from({ length: 100 }, (_, i) => `n${i}.com`);
    expect(CHECK_DOMAINS_INPUT.safeParse({ domains }).success).toBe(true);
  });

  it("rejects a domain longer than 253 characters", () => {
    const long = `${"a".repeat(250)}.com`;
    expect(CHECK_DOMAINS_INPUT.safeParse({ domains: [long] }).success).toBe(
      false,
    );
  });
});

describe("checkDomainsTool", () => {
  it("marks registered domains unavailable and gives links only for the rest", async () => {
    query.mockResolvedValue({ rows: [{ domain: "taken.com" }] });

    const out = await checkDomainsTool({ domains: ["taken.com", "free.io"] });

    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({
      domain: "taken.com",
      available: false,
      registrationUrls: null,
    });
    expect(out.results[1].available).toBe(true);
    expect(out.results[1].registrationUrls).not.toBeNull();
  });

  it("uses one query for the whole batch", async () => {
    query.mockResolvedValue({ rows: [] });
    await checkDomainsTool({ domains: ["a.com", "b.com", "c.com"] });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("skips an entry with no dot rather than throwing", async () => {
    query.mockResolvedValue({ rows: [] });
    const out = await checkDomainsTool({ domains: ["nodot", "fine.com"] });
    expect(out.results.some((r) => r.domain === "fine.com")).toBe(true);
    expect(out.results.every((r) => r.domain !== "nodot")).toBe(true);
  });
});

describe("scoreDomainTool", () => {
  it("returns a score and a breakdown", () => {
    const r = scoreDomainTool({ domain: "inkslot.com" });
    expect(r.score).toBeGreaterThan(0);
    expect(r.breakdown.tldTier).toBe(15);
  });
});

describe("registrationLinksTool", () => {
  it("returns both registrar urls containing the domain", () => {
    const r = registrationLinksTool({ domain: "inkslot.com" });
    expect(r.godaddy).toContain(
      encodeURIComponent("domainToCheck=inkslot.com"),
    );
    expect(r.namecheap).toContain(encodeURIComponent("domain=inkslot.com"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tools`
Expected: FAIL — cannot resolve `@/src/lib/mcp/tools`.

- [ ] **Step 3: Write the tools**

Create `src/lib/mcp/tools.ts`. Tool descriptions are written for a model. The availability caveat is mandatory — a model that mistakes this for WHOIS will tell someone a taken domain is free.

```ts
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { affiliateLinksFor, checkAvailability } from "@/src/lib/domains";
import { scoreDomain } from "@/src/lib/scoring";

const AVAILABILITY_CAVEAT =
  "IMPORTANT: 'available' means the domain is not present in our snapshot of " +
  "registered domains. It is not an authoritative registry or WHOIS check. " +
  "Tell the user to confirm at a registrar before relying on it.";

export const CHECK_DOMAINS_INPUT = z.object({
  domains: z
    .array(z.string().min(3).max(253))
    .min(1)
    .max(100)
    .describe(
      "Full domain names including the TLD, e.g. ['inkslot.com', 'needlebook.io']. Up to 100 per call.",
    ),
});

export const SCORE_DOMAIN_INPUT = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .describe("A full domain name including the TLD."),
});

export const REGISTRATION_LINKS_INPUT = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .describe("A full domain name including the TLD."),
});

export async function checkDomainsTool(args: { domains: string[] }) {
  // checkAvailability takes { name, tld }; anything without a dot is not a
  // domain and is dropped rather than guessed at.
  const parsed = args.domains
    .map((d) => d.trim().toLowerCase())
    .map((d) => {
      const dot = d.indexOf(".");
      return dot === -1
        ? null
        : { name: d.slice(0, dot), tld: d.slice(dot + 1) };
    })
    .filter((d): d is { name: string; tld: string } => d !== null);

  const results = await checkAvailability(parsed);

  return {
    results: results.map((r) => ({
      domain: r.name,
      available: r.available,
      registrationUrls: r.affiliateLinks,
    })),
  };
}

export function scoreDomainTool(args: { domain: string }) {
  return scoreDomain(args.domain);
}

export function registrationLinksTool(args: { domain: string }) {
  const domain = args.domain.trim().toLowerCase();
  return { domain, ...affiliateLinksFor(domain) };
}

function asText(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "check_domains",
    {
      title: "Check domain availability",
      description:
        "Check up to 100 domain names against a database of registered domains in a " +
        "single call. Use this after brainstorming candidate names to filter out the " +
        "ones that are already taken. " +
        AVAILABILITY_CAVEAT,
      inputSchema: CHECK_DOMAINS_INPUT,
    },
    async (args) => asText(await checkDomainsTool(args)),
  );

  server.registerTool(
    "score_domain",
    {
      title: "Score a domain name",
      description:
        "Score a domain 0-100 on brandability, with a breakdown across length, " +
        "pronounceability, hyphens, digits, TLD tier and typo risk. Deterministic " +
        "heuristic, not a judgement — use it to break ties between candidates you " +
        "have already checked for availability.",
      inputSchema: SCORE_DOMAIN_INPUT,
    },
    async (args) => asText(scoreDomainTool(args)),
  );

  server.registerTool(
    "get_registration_links",
    {
      title: "Get registration links",
      description:
        "Get GoDaddy and Namecheap registration URLs for a domain. Use this once the " +
        "user has chosen a name they want to register.",
      inputSchema: REGISTRATION_LINKS_INPUT,
    },
    async (args) => asText(registrationLinksTool(args)),
  );
}
```

**If `registerTool`'s real signature differs from the above** — argument order, the shape of the config object, or how the handler returns content — adapt to the installed types and say so in your report. Do not weaken a schema to make types line up.

- [ ] **Step 4: Run the tests**

Run: `npm test -- tools`
Expected: PASS, 8 tests.

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit && npm run build
npx prettier --write src/lib/mcp/
git add src/lib/mcp/
git commit -m "feat: add MCP tool definitions"
```

---

### Task 4: The MCP route

**Files:**

- Create: `src/app/api/mcp/route.ts`
- Test: `src/app/api/mcp/route.test.ts`

**Interfaces:**

- Consumes: `registerTools` from `@/src/lib/mcp/tools`.
- Produces: `GET`, `POST` and `maxDuration` exports.

**Only route handlers and a small set of config values may be exported from a route module.** Exporting anything else fails `npm run build` — this exact mistake cost three tasks on the previous plan. `maxDuration` is allowed; a helper function is not.

- [ ] **Step 1: Write the failing test**

Create `src/app/api/mcp/route.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { POST } from "@/src/app/api/mcp/route";

function rpc(body: unknown) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mcp", () => {
  it("lists exactly the three tools, each with a description", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    );
    const text = await res.text();

    for (const name of [
      "check_domains",
      "score_domain",
      "get_registration_links",
    ]) {
      expect(text).toContain(name);
    }
  });

  it("warns in check_domains' description that this is not a registry check", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    );
    expect(await res.text()).toMatch(/not an authoritative registry/i);
  });
});
```

If `tools/list` requires an `initialize` handshake first, perform it in the test rather than deleting the assertion. Report what the protocol actually demanded.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- api/mcp`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Write the route**

Create `src/app/api/mcp/route.ts`:

```ts
import { createMcpRouteHandler } from "mcp-handler";

import { registerTools } from "@/src/lib/mcp/tools";

const handler = createMcpRouteHandler(
  (server) => {
    registerTools(server);
  },
  { serverInfo: { name: "dodomains", version: "1.0.0" } },
);

export { handler as GET, handler as POST };

// A batch of 100 domains is one indexed query, but a cold start plus a slow
// connection should not be cut off mid-response.
export const maxDuration = 30;
```

- [ ] **Step 4: Run the tests and the build**

```bash
npm test -- api/mcp
npx tsc --noEmit && npm run build
```

The build must list `/api/mcp` in its route table.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/app/api/mcp/
git add src/app/api/mcp/
git commit -m "feat: add remote MCP endpoint"
```

---

### Task 5: Shared copy and a parameterised OG renderer

**Files:**

- Modify: `src/lib/site.ts`, `src/lib/og-image.tsx`, `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx`

**Interfaces:**

- Produces: `MCP_TAGLINE`, `MCP_DESCRIPTION`, `MCP_ENDPOINT` in `site.ts`; `renderOgImage(tagline: string)` in `og-image.tsx`.

`renderOgImage()` currently hardcodes `TAGLINE`. Task 6 needs a second card, and two renderers would drift.

- [ ] **Step 1: Extend `src/lib/site.ts`**

Add, keeping the existing exports untouched:

```ts
export const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

export const MCP_TAGLINE = "Give your AI agent a domain availability tool";

export const MCP_DESCRIPTION =
  "Connect dodomains to Claude, Cursor or any MCP client. Your agent checks " +
  "domain availability, scores brandability and fetches registration links " +
  "without leaving the conversation. Free, no account, no API key.";
```

- [ ] **Step 2: Parameterise the renderer**

In `src/lib/og-image.tsx`, change the signature to `export async function renderOgImage(tagline: string)` and use `tagline` where `TAGLINE` is referenced today. Drop the now-unused `TAGLINE` import; keep `SITE_URL`.

Everything else about the card — layout, the inlined logo, the explicit gradient stops — stays exactly as it is. **Do not reintroduce `transparent` into the gradient:** Satori renders it as opaque black at zero alpha, which shows up as grey smudges.

- [ ] **Step 3: Update the two existing callers**

`src/app/opengraph-image.tsx` and `src/app/twitter-image.tsx` both become `return renderOgImage(TAGLINE);`.

- [ ] **Step 4: Verify the card still renders**

```bash
npm run build
npm run dev
curl -s -o /tmp/og.png -w "%{http_code} %{content_type} %{size_download}\n" http://localhost:3000/opengraph-image
```

Expect `200 image/png` and a non-trivial byte count. Stop the dev server afterwards.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/site.ts src/lib/og-image.tsx src/app/opengraph-image.tsx src/app/twitter-image.tsx
git add src/lib/site.ts src/lib/og-image.tsx src/app/opengraph-image.tsx src/app/twitter-image.tsx
git commit -m "refactor: parameterise OG renderer, add MCP copy constants"
```

---

### Task 6: The `/mcp` landing page

**Files:**

- Create: `src/app/mcp/page.tsx`, `src/app/mcp/opengraph-image.tsx`, `src/app/mcp/twitter-image.tsx`
- Create: `src/components/copy-button.tsx`

**Interfaces:**

- Consumes: `MCP_ENDPOINT`, `MCP_TAGLINE`, `MCP_DESCRIPTION`, `SITE_URL` from `@/src/lib/site`; `renderOgImage` from `@/src/lib/og-image`.

- [ ] **Step 1: Build the copy button**

Create `src/components/copy-button.tsx` — a client component taking `{ value: string; label?: string }`. It writes to `navigator.clipboard`, swaps its label to `Copied` for two seconds, and restores it. Use the existing `Button` with `variant="outline"` and `size="sm"`. Wrap the clipboard call in try/catch: it rejects on an insecure origin, and an unhandled rejection there kills the page.

- [ ] **Step 2: Build the page**

Create `src/app/mcp/page.tsx`. It is a server component apart from the copy buttons.

Export metadata:

```tsx
export const metadata: Metadata = {
  title: `${SITE_NAME} MCP | ${MCP_TAGLINE}`,
  description: MCP_DESCRIPTION,
  alternates: { canonical: "/mcp" },
  openGraph: {
    title: `${SITE_NAME} MCP | ${MCP_TAGLINE}`,
    description: MCP_DESCRIPTION,
    url: `${SITE_URL}/mcp`,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} MCP | ${MCP_TAGLINE}`,
    description: MCP_DESCRIPTION,
  },
};
```

Sections, in order:

1. **Hero** — the logo at a smaller size than the homepage, `MCP_TAGLINE` as the `<h1>`, one paragraph of `MCP_DESCRIPTION`, then the endpoint in a `font-mono` box with a `CopyButton`.
2. **Setup** — three blocks, each a `Card` titled for its client, each with a `<pre className="font-mono text-xs overflow-x-auto">` and its own `CopyButton`:
   - **Claude Code**: `claude mcp add --transport http dodomains https://dodomains.dev/api/mcp`
   - **Claude Desktop**: JSON with `mcpServers.dodomains.url` set to the endpoint
   - **Cursor**: the same JSON shape, noting it goes in `.cursor/mcp.json`
3. **Tools** — three rows. Name in `font-mono`, one sentence on what it does, one on when a model reaches for it.
4. **The caveat** — the availability snapshot warning, in prose. It belongs on the page, not only in the protocol.
5. **Back link** — to `/`, reading something like "Prefer the web app?".

Reuse the homepage's visual language: the `Waves` background, the glass `Card` (`backdrop-blur-sm bg-background/80`), `max-w-5xl mx-auto`, and the same section spacing. Build every code snippet from `MCP_ENDPOINT` — **no hardcoded URL in the JSX.**

- [ ] **Step 3: Add the page's OG cards**

`src/app/mcp/opengraph-image.tsx` and `src/app/mcp/twitter-image.tsx`, both mirroring the root versions but calling `renderOgImage(MCP_TAGLINE)` and exporting `alt = MCP_TAGLINE`.

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit && npm test && npm run build && npm run lint
```

The build must list `/mcp`, `/mcp/opengraph-image` and `/mcp/twitter-image`.

Then `npm run dev` and check by hand: the page renders, both copy buttons work, `/mcp/opengraph-image` returns a PNG showing the MCP tagline and not the homepage one, and nothing overflows horizontally at 375px.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/app/mcp/ src/components/copy-button.tsx
git add src/app/mcp/ src/components/copy-button.tsx
git commit -m "feat: add /mcp landing page with its own OG card"
```

---

### Task 7: Navbar, homepage copy, README, JSON-LD

**Files:**

- Modify: `src/app/page.tsx`, `src/app/layout.tsx`, `README.md`

- [ ] **Step 1: Add the navbar button**

In the fixed top-right cluster in `src/app/page.tsx` (the `div` with `fixed top-4 right-4 z-50`), add a **Prefer MCP?** link to `/mcp`, styled exactly like the existing GitHub anchor — `inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md bg-background/80 hover:bg-background/90 transition-colors backdrop-blur-sm border-2 border-border/70`.

Place it after `Compare models` and before `ModelConnection`. Use `next/link`.

On `/mcp` the equivalent slot links back to `/` instead — that is part of Task 6's page.

- [ ] **Step 2: Add one line to the homepage's "Why Choose" list**

A fifth bullet, matching the existing markup exactly:

> Works inside your AI agent too — connect the MCP server and Claude or Cursor can check availability without leaving the chat

- [ ] **Step 3: Extend the JSON-LD**

In `src/app/layout.tsx`, add to the existing `WebApplication` object:

```ts
featureList: [
  "LLM-powered domain name generation",
  "Bring your own API key",
  "Domain availability checking",
  "MCP server for AI agents",
],
```

Do not restructure the block. It is built from compile-time constants and must stay that way — that is why the `dangerouslySetInnerHTML` there is safe.

- [ ] **Step 4: Add an MCP section to the README**

After the existing features, a `## 🔌 MCP Server` section with: one line on what it is, the endpoint, the Claude Code one-liner, the JSON config, and the three tools as a short list. Match the README's existing emoji-headed voice — this is an edit, not a rewrite.

- [ ] **Step 5: Full verification**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run build
```

Then `npm run dev` and confirm: the navbar has four items and does not wrap at 1024px wide; **Prefer MCP?** navigates to `/mcp`; the back link returns home.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/ README.md
git add src/ README.md
git commit -m "feat: link MCP from navbar, homepage, README and JSON-LD"
```

---

## Post-merge, by hand

Not code. Vercel dashboard, after the deploy is verified.

1. **Firewall → New Rule**: path `/api/mcp`, action **Rate Limit**, key **IP**, fixed window **60 requests / 60s**, then action **Log**. Publish.
2. Add the server to a real client and exercise all three tools:
   `claude mcp add --transport http dodomains https://dodomains.dev/api/mcp`
   No unit test covers the protocol handshake.
3. Check `/mcp/opengraph-image` renders on the deployed site.
4. After a few days of real traffic, review the Firewall overview and switch the rule from **Log** to **Deny**.
