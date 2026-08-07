/**
 * A deterministic brandability heuristic. No database, no network, no model.
 *
 * It exists so a language model has an objective tiebreaker between candidate
 * names instead of guessing. It is a heuristic, not a judgement — the tool
 * description says so, and so does this comment.
 *
 * The six factors sum to 100 at their maxima: 25 + 25 + 15 + 15 + 15 + 5.
 */

export type ScoreBreakdown = {
  length: number;
  pronounceability: number;
  hyphens: number;
  digits: number;
  tldTier: number;
  typoRisk: number;
};

export type DomainScore = {
  domain: string;
  score: number;
  breakdown: ScoreBreakdown;
  notes: string[];
};

const TOP_TLD = ["com"];
const SECOND_TIER_TLD = ["io", "dev", "app", "ai", "co", "net", "org"];

const VOWELS = /[aeiouy]/;
const CONSONANT_RUN_4 = /[^aeiouy0-9-]{4,}/;
const CONSONANT_RUN_3 = /[^aeiouy0-9-]{3}/;
const HOMOGLYPHS = ["rn", "vv", "cl"];

function splitDomain(domain: string): { name: string; tld: string } {
  const lower = domain.trim().toLowerCase();
  const dot = lower.indexOf(".");
  if (dot === -1) return { name: lower, tld: "" };
  return { name: lower.slice(0, dot), tld: lower.slice(dot + 1) };
}

function scoreLength(name: string, notes: string[]): number {
  const n = name.length;
  if (n >= 4 && n <= 10) return 25;
  if (n < 4) {
    notes.push("Very short names are memorable but rarely available.");
    return 22;
  }
  if (n <= 12) {
    notes.push(`${n} characters is a little long for a snappy brand.`);
    return 20;
  }
  if (n <= 15) {
    notes.push(`${n} characters is long enough to be misremembered.`);
    return 14;
  }
  if (n <= 20) {
    notes.push(`${n} characters is hard to type and hard to say aloud.`);
    return 8;
  }
  notes.push(`${n} characters is too long for a memorable brand.`);
  return 3;
}

function scorePronounceability(name: string, notes: string[]): number {
  let score = 25;
  if (!VOWELS.test(name)) {
    notes.push("No vowel, so the name cannot be pronounced as written.");
    score -= 15;
  }
  if (CONSONANT_RUN_4.test(name)) {
    notes.push("A run of four or more consonants makes this hard to say.");
    score -= 10;
  } else if (CONSONANT_RUN_3.test(name)) {
    notes.push("A run of three consonants makes this harder to say.");
    score -= 5;
  }
  return Math.max(0, score);
}

function scoreHyphens(name: string, notes: string[]): number {
  const count = (name.match(/-/g) ?? []).length;
  if (count === 0) return 15;
  if (count === 1) {
    notes.push(
      "A hyphen has to be spoken aloud every time the name is shared.",
    );
    return 3;
  }
  notes.push("Multiple hyphens read as spam and are easily mistyped.");
  return 0;
}

function scoreDigits(name: string, notes: string[]): number {
  if (!/\d/.test(name)) return 15;
  if (/^[^\d]+\d+$/.test(name)) {
    notes.push("A trailing digit is often heard as a different word.");
    return 8;
  }
  notes.push("Digits inside a word are ambiguous when spoken aloud.");
  return 3;
}

function scoreTld(tld: string, notes: string[]): number {
  if (TOP_TLD.includes(tld)) return 15;
  if (SECOND_TIER_TLD.includes(tld)) {
    notes.push(`.${tld} is well known but still second choice after .com.`);
    return 11;
  }
  notes.push(`.${tld} is outside the endings most people assume by default.`);
  return 6;
}

function scoreTypoRisk(name: string, notes: string[]): number {
  let score = 5;
  for (const pair of HOMOGLYPHS) {
    if (name.includes(pair)) {
      notes.push(`"${pair}" is easily misread at small sizes.`);
      score -= 2;
      break;
    }
  }
  if (/(.)\1\1/.test(name)) {
    notes.push("Three identical letters in a row invite a typo.");
    score -= 2;
  }
  return Math.max(0, score);
}

export function scoreDomain(domain: string): DomainScore {
  const { name, tld } = splitDomain(domain);
  const notes: string[] = [];

  const breakdown: ScoreBreakdown = {
    length: scoreLength(name, notes),
    pronounceability: scorePronounceability(name, notes),
    hyphens: scoreHyphens(name, notes),
    digits: scoreDigits(name, notes),
    tldTier: scoreTld(tld, notes),
    typoRisk: scoreTypoRisk(name, notes),
  };

  const score = Object.values(breakdown).reduce((a, b) => a + b, 0);

  return {
    domain: domain.trim().toLowerCase(),
    score: Math.max(0, Math.min(100, score)),
    breakdown,
    notes,
  };
}
