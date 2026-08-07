import { describe, expect, it } from "vitest";

import { llmSchema } from "@/src/lib/llm-schema";

const base = { provider: "custom", model: "qwen3-max", apiKey: "k" };
const parse = (baseUrl: string) => llmSchema.safeParse({ ...base, baseUrl });

describe("llmSchema baseUrl", () => {
  it.each([
    "https://api.example.com/v1",
    "http://api.example.com/v1",
    "https://openrouter.ai/api/v1",
    "https://8.8.8.8/v1",
    "https://203.0.113.10:8080/v1",
  ])("accepts the public endpoint %s", (u) => {
    expect(parse(u).success).toBe(true);
  });

  it.each(["file:///etc/passwd", "gopher://example.com", "ftp://internal/x"])(
    "rejects the non-http scheme %s",
    (u) => {
      expect(parse(u).success).toBe(false);
    },
  );

  // Every one of these resolves on OUR network, never the caller's, so
  // permitting them buys no functionality and hands out a probe of our egress.
  it.each([
    "http://localhost:11434/v1",
    "http://LOCALHOST:11434/v1",
    "http://foo.localhost/v1",
    "http://printer.local/v1",
    "http://127.0.0.1:5432",
    "http://127.1.2.3/v1",
    "http://0.0.0.0/v1",
    "http://10.0.0.5:8080",
    "http://172.16.4.4/v1",
    "http://172.31.255.1/v1",
    "http://192.168.1.1/v1",
    "http://169.254.169.254/latest/meta-data/",
    "http://100.64.0.1/v1",
    "http://[::1]:11434/v1",
    "http://[fd00::1]/v1",
    "http://[fe80::1]/v1",
    "http://[::ffff:127.0.0.1]/v1",
  ])("rejects the private or local address %s", (u) => {
    expect(parse(u).success).toBe(false);
  });

  it("does not block public addresses that merely look adjacent to private ranges", () => {
    // 172.32.x is public; only 172.16–172.31 is private.
    expect(parse("http://172.32.0.1/v1").success).toBe(true);
    // 100.128.x is public; only 100.64–100.127 is carrier-grade NAT.
    expect(parse("http://100.128.0.1/v1").success).toBe(true);
    // 169.253.x is public; only 169.254.x is link-local.
    expect(parse("http://169.253.0.1/v1").success).toBe(true);
  });

  it("explains why a local address was rejected", () => {
    const r = parse("http://localhost:11434/v1");
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(JSON.stringify(r.error.issues)).toMatch(/our servers, not yours/i);
    }
  });

  it("still requires a base URL for the custom provider", () => {
    expect(llmSchema.safeParse(base).success).toBe(false);
  });

  it("does not require a base URL for a normal provider", () => {
    expect(
      llmSchema.safeParse({
        provider: "openai",
        model: "gpt-5-nano",
        apiKey: "sk-x",
      }).success,
    ).toBe(true);
  });
});
