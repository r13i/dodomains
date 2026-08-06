import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveModel, generateText } = vi.hoisted(() => ({
  resolveModel: vi.fn(),
  generateText: vi.fn(),
}));

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
    generateText.mockRejectedValue(new Error("auth failed for key sk-test"));
    const res = await POST(body(llm));
    expect(JSON.stringify(await res.json())).not.toContain("sk-test");
  });
});
