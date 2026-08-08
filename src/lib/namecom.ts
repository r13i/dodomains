/**
 * Minimal client for name.com's Core API availability check.
 *
 * Response semantics are subtle (measured against production, see
 * docs/research/2026-08-08-namecom-decision.md):
 *
 * - `purchasable: true` does NOT always mean registerable. Aftermarket
 *   listings of already-registered domains come back purchasable with a
 *   `purchaseType` of "aftermarket_*" and five-figure prices. Those are taken.
 * - `purchasable: false` conflates "registered" and "registry-reserved".
 *   Both are taken from the user's point of view (no sale possible).
 * - Rows can be silently omitted from an HTTP 200 response (measured on
 *   .de/.eu). Absent rows must never default to a verdict — the caller
 *   decides what to do with domains we got no answer for.
 */

export type PurchasabilityVerdict = "available" | "taken" | "unknown";

const API_URL = "https://api.name.com/core/v1/domains:checkAvailability";
const BATCH_LIMIT = 50;
const TIMEOUT_MS = 2500;

type NamecomRow = {
  domainName?: string;
  purchasable?: boolean;
  purchaseType?: string;
};

/** Exported for tests. Maps one response row to a verdict. */
export function verdictForRow(row: NamecomRow): PurchasabilityVerdict {
  if (row.purchasable === true) {
    if (row.purchaseType === "registration") return "available";
    if (row.purchaseType?.startsWith("aftermarket")) return "taken";
    // A purchase type we don't recognize: fail closed rather than link a
    // checkout we don't understand.
    return "unknown";
  }
  if (row.purchasable === false) return "taken";
  return "unknown";
}

/**
 * Checks domains against name.com. Returns a map of lowercase full domain →
 * verdict. Domains missing from the map got no answer (API disabled, request
 * failed, or row silently omitted) — the caller must treat those as
 * unresolved, never as available.
 */
export async function checkPurchasability(
  fullDomains: string[],
): Promise<Map<string, PurchasabilityVerdict>> {
  const verdicts = new Map<string, PurchasabilityVerdict>();
  const username = process.env.NAME_COM_USERNAME;
  const token = process.env.NAME_COM_TOKEN;
  if (!username || !token || fullDomains.length === 0) return verdicts;

  const auth = `Basic ${Buffer.from(`${username}:${token}`).toString("base64")}`;

  const chunks: string[][] = [];
  for (let i = 0; i < fullDomains.length; i += BATCH_LIMIT) {
    chunks.push(fullDomains.slice(i, i + BATCH_LIMIT));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({ domainNames: chunk }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) {
          console.error(`name.com checkAvailability HTTP ${res.status}`);
          return;
        }
        const body = (await res.json()) as { results?: NamecomRow[] };
        const requested = new Set(chunk);
        for (const row of body.results ?? []) {
          const name = row.domainName?.toLowerCase();
          // Only trust rows that answer a domain we actually asked about.
          if (name && requested.has(name)) {
            verdicts.set(name, verdictForRow(row));
          }
        }
      } catch (error) {
        // Timeout or network failure: leave the chunk unresolved.
        console.error("name.com checkAvailability failed:", error);
      }
    }),
  );

  return verdicts;
}
