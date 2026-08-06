import { describe, expect, it } from "vitest";
import { PROVIDERS, PROVIDER_IDS, getProvider } from "@/src/lib/providers";

describe("provider registry", () => {
  it("has nine providers", () => {
    expect(PROVIDERS).toHaveLength(9);
  });

  it("lists every free provider before every paid one", () => {
    const firstPaid = PROVIDERS.findIndex((p) => !p.free);
    const lastFree = PROVIDERS.map((p) => p.free).lastIndexOf(true);
    expect(lastFree).toBeLessThan(firstPaid);
  });

  it("has unique ids that match PROVIDER_IDS", () => {
    const ids = PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it("gives every non-custom provider at least one seeded model", () => {
    for (const p of PROVIDERS) {
      if (p.id === "custom") continue;
      expect(p.models.length, `${p.id} has no models`).toBeGreaterThan(0);
    }
  });

  it("has no empty model ids and no negative prices", () => {
    for (const p of PROVIDERS) {
      for (const m of p.models) {
        expect(m.id.trim(), `${p.id} model id`).not.toBe("");
        expect(m.in).toBeGreaterThanOrEqual(0);
        expect(m.out).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("requires a base URL only for custom", () => {
    for (const p of PROVIDERS) {
      expect(p.needsBaseUrl).toBe(p.id === "custom");
    }
  });

  it("resolves a known id and rejects an unknown one", () => {
    expect(getProvider("openai")?.label).toBe("OpenAI");
    expect(getProvider("nope")).toBeUndefined();
  });
});
