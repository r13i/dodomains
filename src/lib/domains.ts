import pool from "@/src/lib/db";

export type DomainSuggestion = { name: string; tld: string };

export type AffiliateLinks = { godaddy: string; namecheap: string };

export type DomainResult = {
  name: string;
  available: boolean;
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
 * Checks each suggestion against the registered-domain table.
 *
 * The table is a snapshot of registered domains, so `available: true` means
 * "not in our snapshot", not an authoritative registry answer.
 *
 * If the query fails, everything is reported available. This is deliberate and
 * matches the original behavior: a database outage must not block the page.
 */
export async function checkAvailability(
  suggestions: DomainSuggestion[],
): Promise<DomainResult[]> {
  if (suggestions.length === 0) return [];

  const fullDomains = suggestions.map((d) =>
    `${d.name}.${d.tld}`.toLowerCase(),
  );
  let registered = new Set<string>();

  try {
    const result = await pool.query({
      text: `SELECT domain FROM domains WHERE domain = ANY($1)`,
      values: [fullDomains],
    });
    registered = new Set(
      result.rows.map((row: { domain: string }) => row.domain.toLowerCase()),
    );
  } catch (error) {
    console.error("Database query error:", error);
  }

  return suggestions.map((d) => {
    const fullDomain = `${d.name}.${d.tld}`;
    const available = !registered.has(fullDomain.toLowerCase());
    return {
      name: fullDomain,
      available,
      affiliateLinks: available ? affiliateLinksFor(fullDomain) : null,
    };
  });
}
