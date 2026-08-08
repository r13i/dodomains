import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/src/lib/db", () => ({ default: { query } }));

import {
  CHECK_DOMAINS_INPUT,
  checkDomainsTool,
  registrationLinksTool,
  scoreDomainTool,
} from "@/src/lib/mcp/tools";

const fetchMock = vi.fn();

function namecomResponse(
  results: { domainName: string; purchasable: boolean; purchaseType?: string }[],
) {
  return { ok: true, status: 200, json: async () => ({ results }) };
}

beforeEach(() => {
  query.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NAME_COM_USERNAME", "user");
  vi.stubEnv("NAME_COM_TOKEN", "token");
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

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

  it("rejects labels that are empty or missing", () => {
    for (const bad of [".com", "foo.", "nodot"]) {
      expect(CHECK_DOMAINS_INPUT.safeParse({ domains: [bad] }).success).toBe(
        false,
      );
    }
  });

  it("accepts legitimate multi-label, hyphenated and digit domains", () => {
    for (const good of ["foo.co.uk", "my-thing2.io", "a1-b2.com"]) {
      expect(CHECK_DOMAINS_INPUT.safeParse({ domains: [good] }).success).toBe(
        true,
      );
    }
  });
});

describe("checkDomainsTool", () => {
  it("reports status per domain and gives links only for available ones", async () => {
    fetchMock.mockResolvedValue(
      namecomResponse([
        { domainName: "taken.com", purchasable: false },
        {
          domainName: "free.io",
          purchasable: true,
          purchaseType: "registration",
        },
      ]),
    );

    const out = await checkDomainsTool({ domains: ["taken.com", "free.io"] });

    expect(out.results).toHaveLength(2);
    expect(out.results[0]).toMatchObject({
      domain: "taken.com",
      status: "taken",
      registrationUrls: null,
    });
    expect(out.results[1].status).toBe("available");
    expect(out.results[1].registrationUrls).not.toBeNull();
  });

  it("skips an entry with no dot rather than throwing", async () => {
    fetchMock.mockResolvedValue(namecomResponse([]));
    query.mockResolvedValue({ rows: [] });
    const out = await checkDomainsTool({ domains: ["nodot", "fine.com"] });
    expect(out.results.some((r) => r.domain === "fine.com")).toBe(true);
    expect(out.results.every((r) => r.domain !== "nodot")).toBe(true);
  });

  it("degrades to unknown instead of failing when every source is down", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    query.mockImplementationOnce(() =>
      Promise.reject(new Error("connection refused")),
    );
    const out = await checkDomainsTool({ domains: ["any.com"] });
    expect(out.results[0]).toMatchObject({
      domain: "any.com",
      status: "unknown",
      registrationUrls: null,
    });
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
