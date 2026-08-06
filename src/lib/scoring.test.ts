import { describe, expect, it } from "vitest";
import { scoreDomain } from "@/src/lib/scoring";

describe("scoreDomain", () => {
  it("gives a short .com word close to full marks", () => {
    const r = scoreDomain("inkslot.com");
    expect(r.score).toBeGreaterThan(85);
    expect(r.breakdown.hyphens).toBe(15);
    expect(r.breakdown.digits).toBe(15);
    expect(r.breakdown.tldTier).toBe(15);
  });

  it("penalises hyphens", () => {
    expect(scoreDomain("ink-slot.com").score).toBeLessThan(
      scoreDomain("inkslot.com").score,
    );
    expect(scoreDomain("ink-slot-book.com").breakdown.hyphens).toBe(0);
  });

  it("penalises digits, and mid-word digits harder", () => {
    const trailing = scoreDomain("inkslot7.com").breakdown.digits;
    const middle = scoreDomain("ink5lot.com").breakdown.digits;
    expect(trailing).toBeLessThan(15);
    expect(middle).toBeLessThan(trailing);
  });

  it("penalises a name with no vowel", () => {
    expect(scoreDomain("bxdfgh.com").breakdown.pronounceability).toBeLessThan(
      scoreDomain("inkslot.com").breakdown.pronounceability,
    );
  });

  it("penalises long consonant runs", () => {
    expect(
      scoreDomain("angstschrift.com").breakdown.pronounceability,
    ).toBeLessThan(25);
  });

  it("ranks .com above a second-tier tld above the long tail", () => {
    const com = scoreDomain("inkslot.com").breakdown.tldTier;
    const io = scoreDomain("inkslot.io").breakdown.tldTier;
    const xyz = scoreDomain("inkslot.xyz").breakdown.tldTier;
    expect(com).toBeGreaterThan(io);
    expect(io).toBeGreaterThan(xyz);
  });

  it("penalises very long names", () => {
    expect(
      scoreDomain("theverylongestdomainnameever.com").breakdown.length,
    ).toBeLessThan(scoreDomain("inkslot.com").breakdown.length);
  });

  it("flags homoglyph typo risk", () => {
    expect(scoreDomain("modern.com").breakdown.typoRisk).toBeLessThan(5);
  });

  it("always returns a score between 0 and 100", () => {
    for (const d of [
      "a.com",
      "inkslot.com",
      "x-y-z-1-2-3.museum",
      "bxdfghjklmnpqrst.xyz",
      "the-very-longest-hyphenated-name-anyone-has-tried.co.uk",
    ]) {
      const r = scoreDomain(d);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });

  it("is deterministic", () => {
    expect(scoreDomain("inkslot.com")).toEqual(scoreDomain("inkslot.com"));
  });

  it("explains every penalty it applies", () => {
    const r = scoreDomain("ink-5lot.xyz");
    expect(r.notes.length).toBeGreaterThan(0);
    expect(r.notes.join(" ")).toMatch(/hyphen/i);
  });

  it("handles a domain with no dot without throwing", () => {
    expect(() => scoreDomain("nodot")).not.toThrow();
  });
});
