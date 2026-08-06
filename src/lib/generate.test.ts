import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4Usage } from "@ai-sdk/provider";
import { buildPrompt, generateDomains } from "@/src/lib/generate";

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
};
const finishReason = { unified: "stop", raw: "stop" } as const;

const mockReturning = (payload: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      finishReason,
      usage,
      content: [{ type: "text", text: JSON.stringify(payload) }],
      warnings: [],
    }),
  });

const base = {
  keywords: ["tattoo"],
  domainLength: 10,
  domainStyle: "balanced",
};

describe("buildPrompt", () => {
  it("includes the keywords", () => {
    expect(buildPrompt({ ...base, keywords: ["tattoo", "booking"] })).toContain(
      "tattoo, booking",
    );
  });

  it("includes the description when given and omits the line when not", () => {
    expect(buildPrompt({ ...base, description: "A booking tool" })).toContain(
      "A booking tool",
    );
    expect(buildPrompt(base)).not.toContain("Project Description:");
  });

  it("constrains to the chosen TLDs when the user picked some", () => {
    const p = buildPrompt({ ...base, tlds: ["io", "dev"] });
    expect(p).toContain("io, dev");
    expect(p).toMatch(/only use these specific TLDs/i);
  });

  it("suggests creative TLDs for a creative style when none were picked", () => {
    const p = buildPrompt({ ...base, domainStyle: "creative" });
    expect(p).toContain("xyz");
  });

  it("suggests popular TLDs for a professional style when none were picked", () => {
    const p = buildPrompt({ ...base, domainStyle: "professional" });
    expect(p).toContain("com");
    expect(p).not.toContain("design");
  });

  it("works from a description alone with no keywords", () => {
    const p = buildPrompt({
      ...base,
      keywords: [],
      description: "A booking tool",
    });
    expect(p).toContain("A booking tool");
  });
});

describe("generateDomains", () => {
  it("returns the parsed suggestions", async () => {
    const model = mockReturning({
      domains: [
        { name: "inkslot", tld: "com" },
        { name: "needlebook", tld: "io" },
        { name: "flashbook", tld: "co" },
        { name: "tattoodesk", tld: "app" },
        { name: "skinslot", tld: "dev" },
      ],
    });

    const out = await generateDomains(model, base);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ name: "inkslot", tld: "com" });
  });

  it("sends the instructions and the prompt to the model", async () => {
    const model = mockReturning({
      domains: Array.from({ length: 5 }, (_, i) => ({
        name: `n${i}`,
        tld: "com",
      })),
    });
    await generateDomains(model, {
      ...base,
      keywords: ["tattoo"],
      description: "A booking tool",
    });

    expect(model.doGenerateCalls).toHaveLength(1);

    const sent = JSON.stringify(model.doGenerateCalls[0]);
    expect(sent).toContain("domain name generation expert"); // from SYSTEM_PROMPT
    expect(sent).toContain("tattoo"); // the keyword
    expect(sent).toContain("A booking tool"); // the description
    expect(sent).toContain("balanced"); // the style
  });

  it("rejects when the model returns fewer than five suggestions", async () => {
    const model = mockReturning({ domains: [{ name: "one", tld: "com" }] });
    await expect(generateDomains(model, base)).rejects.toThrow();
  });
});
