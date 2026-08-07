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

  it("rejects labels that are empty or missing", () => {
    for (const bad of [".com", "foo.", "nodot"]) {
      expect(
        CHECK_DOMAINS_INPUT.safeParse({ domains: [bad] }).success,
      ).toBe(false);
    }
  });

  it("accepts legitimate multi-label, hyphenated and digit domains", () => {
    for (const good of ["foo.co.uk", "my-thing2.io", "a1-b2.com"]) {
      expect(
        CHECK_DOMAINS_INPUT.safeParse({ domains: [good] }).success,
      ).toBe(true);
    }
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

  it("rejects rather than reporting availability when the pool rejects", async () => {
    // mockImplementationOnce (not mockRejectedValue) avoids a vitest 4.1.10
    // quirk where mockRejectedValue's rejection, combined with this file's
    // beforeEach(query.mockReset()), surfaces as an unhandled rejection
    // even though it is properly caught below.
    query.mockImplementationOnce(() =>
      Promise.reject(new Error("connection refused")),
    );
    await expect(
      checkDomainsTool({ domains: ["any.com"] }),
    ).rejects.toThrow(/unreachable/i);
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
