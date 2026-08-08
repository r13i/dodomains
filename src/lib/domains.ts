import pool from "@/src/lib/db";
import { checkPurchasability } from "@/src/lib/namecom";

export type DomainSuggestion = { name: string; tld: string };

export type AffiliateLinks = { godaddy: string; namecheap: string };

export type DomainStatus = "available" | "taken" | "unknown";

export type DomainResult = {
  name: string;
  status: DomainStatus;
  /** Non-null only when status is "available". */
  affiliateLinks: AffiliateLinks | null;
};

export function affiliateLinksFor(fullDomain: string): AffiliateLinks {
  return {
    godaddy: `https://www.anrdoezrs.net/click-101410219-11774111?url=${encodeURIComponent(
      `https://www.godaddy.com/domainsearch/find?checkAvail=1&domainToCheck=${fullDomain}`,
    )}`,
    namecheap: `https://www.anrdoezrs.net/click-101410219-12892698?url=${encodeURIComponent(
      `https://www.namecheap.com/domains/registration/results/?domain=${fullDomain}`,
    )}`,
  };
}

/**
 * Looks up domains in the registered-domain snapshot table.
 *
 * The snapshot is only trusted in one direction: a domain present in it is
 * definitely taken, but absence proves nothing (the snapshot is stale and
 * covers no ccTLDs). On query failure it returns an empty set, which the
 * caller maps to "unknown" — never to "available".
 */
async function snapshotRegistered(fullDomains: string[]): Promise<Set<string>> {
  try {
    const result = await pool.query({
      text: `SELECT domain FROM domains WHERE domain = ANY($1)`,
      values: [fullDomains],
    });
    return new Set(
      result.rows.map((row: { domain: string }) => row.domain.toLowerCase()),
    );
  } catch (error) {
    console.error("Database query error:", error);
    return new Set();
  }
}

/**
 * Determines availability for each suggestion.
 *
 * Primary source: name.com's live availability API. Fallback for domains it
 * gives no answer for: the registered-domain snapshot, trusted only for
 * "taken". Every failure path degrades to "unknown" — no error, timeout or
 * missing row may ever render a domain as available.
 */
export async function checkAvailability(
  suggestions: DomainSuggestion[],
): Promise<DomainResult[]> {
  if (suggestions.length === 0) return [];

  const fullDomains = suggestions.map((d) =>
    `${d.name}.${d.tld}`.toLowerCase(),
  );

  const verdicts = await checkPurchasability(fullDomains);

  const unresolved = fullDomains.filter((d) => !verdicts.has(d));
  const registered =
    unresolved.length > 0
      ? await snapshotRegistered(unresolved)
      : new Set<string>();

  return suggestions.map((d) => {
    const fullDomain = `${d.name}.${d.tld}`;
    const key = fullDomain.toLowerCase();
    const status: DomainStatus =
      verdicts.get(key) ?? (registered.has(key) ? "taken" : "unknown");
    return {
      name: fullDomain,
      status,
      affiliateLinks:
        status === "available" ? affiliateLinksFor(fullDomain) : null,
    };
  });
}
