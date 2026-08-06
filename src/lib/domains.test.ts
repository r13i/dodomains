import { afterEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/db", () => ({ default: { query } }));

import { affiliateLinksFor, checkAvailability } from "@/src/lib/domains";

afterEach(() => query.mockReset());

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
