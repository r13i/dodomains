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
      new NoObjectGeneratedError({
        message: "no object",
        text: "not json",
        // v7's constructor requires these; values are irrelevant to the test.
        response: { id: "test", timestamp: new Date(0), modelId: "test-model" },
        usage: {
          inputTokens: undefined,
          inputTokenDetails: {
            noCacheTokens: undefined,
            cacheReadTokens: undefined,
            cacheWriteTokens: undefined,
          },
          outputTokens: undefined,
          outputTokenDetails: {
            textTokens: undefined,
            reasoningTokens: undefined,
          },
          totalTokens: undefined,
        },
        finishReason: "other",
      }),
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

  it("prefers provider_unreachable over no_credit when there is no status code", () => {
    const err = new APICallError({
      message: "network down",
      url: "https://api.example.com/v1/chat",
      requestBodyValues: {},
      responseBody: "insufficient_quota",
      isRetryable: false,
    });
    const r = mapProviderError(err, "OpenAI", "gpt-5-mini");
    expect(r.code).toBe("provider_unreachable");
    expect(r.status).toBe(502);
  });

  it("reads a quota body out of a 429 as no_credit, not rate_limited", () => {
    const r = mapProviderError(
      apiError(429, '{"error":{"code":"insufficient_quota"}}'),
      "OpenAI",
      "gpt-5-mini",
    );
    expect(r.code).toBe("no_credit");
  });
});
