import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveModel, generateDomains, checkAvailability } = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  generateDomains: vi.fn(),
  checkAvailability: vi.fn(),
}));

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

  it("accepts a request with no domainLength, domainStyle or tlds", async () => {
    const res = await POST(body({ keywords: ["tattoo"], llm }));
    expect(res.status).toBe(200);
    expect(generateDomains).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ domainStyle: expect.anything() }),
    );
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
    generateDomains.mockRejectedValue(new Error("auth failed for key sk-test"));
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
