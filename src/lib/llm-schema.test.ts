import { describe, expect, it } from "vitest";

import { llmSchema } from "@/src/lib/llm-schema";

const base = {
  provider: "custom",
  model: "some-model",
  apiKey: "sk-test",
};

describe("llmSchema baseUrl", () => {
  it("accepts an https base URL", () => {
    const result = llmSchema.safeParse({
      ...base,
      baseUrl: "https://api.example.com/v1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a local http base URL (local Ollama)", () => {
    const result = llmSchema.safeParse({
      ...base,
      baseUrl: "http://localhost:11434/v1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a file: URL", () => {
    const result = llmSchema.safeParse({
      ...base,
      baseUrl: "file:///etc/passwd",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a gopher: URL", () => {
    const result = llmSchema.safeParse({
      ...base,
      baseUrl: "gopher://x",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an ftp: URL", () => {
    const result = llmSchema.safeParse({
      ...base,
      baseUrl: "ftp://internal/x",
    });
    expect(result.success).toBe(false);
  });
});
