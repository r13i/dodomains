import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("@/src/lib/db", () => ({ default: { query } }));

import { affiliateLinksFor, checkAvailability } from "@/src/lib/domains";
import { verdictForRow } from "@/src/lib/namecom";

const fetchMock = vi.fn();

function namecomResponse(
  results: { domainName: string; purchasable: boolean; purchaseType?: string }[],
) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ results }),
  };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NAME_COM_USERNAME", "user");
  vi.stubEnv("NAME_COM_TOKEN", "token");
  query.mockResolvedValue({ rows: [] });
});

afterEach(() => {
  fetchMock.mockReset();
  query.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("verdictForRow", () => {
  it("maps purchasable registration to available", () => {
    expect(
      verdictForRow({ purchasable: true, purchaseType: "registration" }),
    ).toBe("available");
  });

  it("maps aftermarket listings to taken, never available", () => {
    for (const purchaseType of ["aftermarket_s", "aftermarket_b"]) {
      expect(verdictForRow({ purchasable: true, purchaseType })).toBe("taken");
    }
  });

  it("fails closed on an unrecognized purchase type", () => {
    expect(verdictForRow({ purchasable: true, purchaseType: "lease" })).toBe(
      "unknown",
    );
    expect(verdictForRow({ purchasable: true })).toBe("unknown");
  });

  it("maps purchasable false to taken", () => {
    expect(verdictForRow({ purchasable: false })).toBe("taken");
  });

  it("maps a malformed row to unknown", () => {
    expect(verdictForRow({})).toBe("unknown");
  });
});

describe("checkAvailability", () => {
  it("uses the name.com verdict and links only available domains", async () => {
    fetchMock.mockResolvedValue(
      namecomResponse([
        {
          domainName: "free.io",
          purchasable: true,
          purchaseType: "registration",
        },
        { domainName: "taken.com", purchasable: false },
      ]),
    );

    const results = await checkAvailability([
      { name: "taken", tld: "com" },
      { name: "free", tld: "io" },
    ]);

    expect(results[0]).toMatchObject({
      name: "taken.com",
      status: "taken",
      affiliateLinks: null,
    });
    expect(results[1].status).toBe("available");
    expect(results[1].affiliateLinks).not.toBeNull();
    // Everything answered by name.com: the snapshot is not consulted.
    expect(query).not.toHaveBeenCalled();
  });

  it("never links an aftermarket listing", async () => {
    fetchMock.mockResolvedValue(
      namecomResponse([
        {
          domainName: "mail.online",
          purchasable: true,
          purchaseType: "aftermarket_s",
        },
      ]),
    );
    const results = await checkAvailability([{ name: "mail", tld: "online" }]);
    expect(results[0].status).toBe("taken");
    expect(results[0].affiliateLinks).toBeNull();
  });

  it("falls back to the snapshot for rows name.com omits: hit → taken", async () => {
    fetchMock.mockResolvedValue(namecomResponse([]));
    query.mockResolvedValue({ rows: [{ domain: "ghost.de" }] });

    const results = await checkAvailability([{ name: "ghost", tld: "de" }]);
    expect(results[0].status).toBe("taken");
  });

  it("falls back to the snapshot for rows name.com omits: miss → unknown, not available", async () => {
    fetchMock.mockResolvedValue(namecomResponse([]));
    query.mockResolvedValue({ rows: [] });

    const results = await checkAvailability([{ name: "ghost", tld: "de" }]);
    expect(results[0].status).toBe("unknown");
    expect(results[0].affiliateLinks).toBeNull();
  });

  it("degrades to unknown when both name.com and the snapshot fail", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    query.mockRejectedValue(new Error("connection refused"));

    const results = await checkAvailability([{ name: "any", tld: "com" }]);
    expect(results[0].status).toBe("unknown");
    expect(results[0].affiliateLinks).toBeNull();
  });

  it("treats a non-200 from name.com as unresolved", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({}),
    });
    query.mockResolvedValue({ rows: [{ domain: "known.com" }] });

    const results = await checkAvailability([{ name: "known", tld: "com" }]);
    expect(results[0].status).toBe("taken");
  });

  it("skips the API and uses the snapshot when credentials are absent", async () => {
    vi.stubEnv("NAME_COM_USERNAME", "");
    vi.stubEnv("NAME_COM_TOKEN", "");
    query.mockResolvedValue({ rows: [{ domain: "taken.com" }] });

    const results = await checkAvailability([
      { name: "taken", tld: "com" },
      { name: "free", tld: "io" },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(results[0].status).toBe("taken");
    // Absence from the snapshot is not proof of availability.
    expect(results[1].status).toBe("unknown");
  });

  it("matches name.com rows case-insensitively", async () => {
    fetchMock.mockResolvedValue(
      namecomResponse([{ domainName: "TAKEN.COM", purchasable: false }]),
    );
    const results = await checkAvailability([{ name: "Taken", tld: "Com" }]);
    expect(results[0].status).toBe("taken");
  });

  it("ignores response rows for domains that were not requested", async () => {
    fetchMock.mockResolvedValue(
      namecomResponse([
        {
          domainName: "other.com",
          purchasable: true,
          purchaseType: "registration",
        },
      ]),
    );
    const results = await checkAvailability([{ name: "mine", tld: "com" }]);
    expect(results[0].status).toBe("unknown");
  });

  it("returns an empty array for no suggestions", async () => {
    expect(await checkAvailability([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("splits more than 50 domains into multiple name.com calls", async () => {
    fetchMock.mockResolvedValue(namecomResponse([]));
    query.mockResolvedValue({ rows: [] });
    const suggestions = Array.from({ length: 60 }, (_, i) => ({
      name: `n${i}`,
      tld: "com",
    }));
    await checkAvailability(suggestions);
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
