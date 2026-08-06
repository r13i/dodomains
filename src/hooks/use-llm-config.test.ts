import { describe, expect, it } from "vitest";
import { readStoredConfig } from "@/src/hooks/use-llm-config";

const valid = { provider: "openai", model: "gpt-5-mini", apiKey: "sk-test" };

describe("readStoredConfig", () => {
  it("returns null for nothing stored", () => {
    expect(readStoredConfig(null)).toBeNull();
  });

  it("returns null for unparseable json", () => {
    expect(readStoredConfig("{not json")).toBeNull();
  });

  it("returns null when a required field is missing", () => {
    expect(readStoredConfig(JSON.stringify({ provider: "openai" }))).toBeNull();
  });

  it("returns null for a provider that no longer exists", () => {
    expect(
      readStoredConfig(JSON.stringify({ ...valid, provider: "gone" })),
    ).toBeNull();
  });

  it("returns null for custom without a base url", () => {
    expect(
      readStoredConfig(JSON.stringify({ ...valid, provider: "custom" })),
    ).toBeNull();
  });

  it("accepts a valid config", () => {
    expect(readStoredConfig(JSON.stringify(valid))).toEqual(valid);
  });

  it("accepts a valid custom config", () => {
    const custom = {
      ...valid,
      provider: "custom",
      baseUrl: "http://localhost:11434/v1",
    };
    expect(readStoredConfig(JSON.stringify(custom))).toEqual(custom);
  });
});
