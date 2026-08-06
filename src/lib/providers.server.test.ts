import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "@/src/lib/providers";
import { FACTORIES, resolveModel } from "@/src/lib/providers.server";

describe("provider factories", () => {
  it("has exactly one factory per registry id", () => {
    expect(Object.keys(FACTORIES).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it("builds a model instance for every non-custom provider", () => {
    for (const id of PROVIDER_IDS) {
      if (id === "custom") continue;
      const model = resolveModel({
        provider: id,
        model: "some-model",
        apiKey: "test-key",
      });
      expect(model, id).toBeTruthy();
      expect(typeof model.doGenerate, id).toBe("function");
    }
  });

  it("builds a model instance for custom when a base URL is given", () => {
    const model = resolveModel({
      provider: "custom",
      model: "qwen3-max",
      apiKey: "test-key",
      baseUrl: "http://localhost:11434/v1",
    });
    expect(typeof model.doGenerate).toBe("function");
  });

  it("throws for custom without a base URL", () => {
    expect(() =>
      resolveModel({ provider: "custom", model: "x", apiKey: "k" }),
    ).toThrow(/base url/i);
  });

  it("throws for an unknown provider", () => {
    expect(() =>
      resolveModel({ provider: "nope", model: "x", apiKey: "k" }),
    ).toThrow(/unknown provider/i);
  });
});
