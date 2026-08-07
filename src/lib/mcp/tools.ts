import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { affiliateLinksFor, checkAvailability } from "@/src/lib/domains";
import { scoreDomain } from "@/src/lib/scoring";

const AVAILABILITY_CAVEAT =
  "IMPORTANT: 'available' means the domain is not present in our snapshot of " +
  "registered domains. It is not an authoritative registry or WHOIS check. " +
  "Tell the user to confirm at a registrar before relying on it.";

export const CHECK_DOMAINS_INPUT = z.object({
  domains: z
    .array(
      z
        .string()
        .min(3)
        .max(253)
        .regex(
          /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i,
          "must be a domain with at least two non-empty labels, e.g. example.com",
        ),
    )
    .min(1)
    .max(100)
    .describe(
      "Full domain names including the TLD, e.g. ['inkslot.com', 'needlebook.io']. Up to 100 per call.",
    ),
});

export const SCORE_DOMAIN_INPUT = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .describe("A full domain name including the TLD."),
});

export const REGISTRATION_LINKS_INPUT = z.object({
  domain: z
    .string()
    .min(3)
    .max(253)
    .describe("A full domain name including the TLD."),
});

export async function checkDomainsTool(args: { domains: string[] }) {
  // checkAvailability takes { name, tld }; anything without a dot is not a
  // domain and is dropped rather than guessed at.
  const parsed = args.domains
    .map((d) => d.trim().toLowerCase())
    .map((d) => {
      const dot = d.indexOf(".");
      return dot === -1
        ? null
        : { name: d.slice(0, dot), tld: d.slice(dot + 1) };
    })
    .filter((d): d is { name: string; tld: string } => d !== null);

  const results = await checkAvailability(parsed, "throw");

  return {
    results: results.map((r) => ({
      domain: r.name,
      available: r.available,
      registrationUrls: r.affiliateLinks,
    })),
  };
}

export function scoreDomainTool(args: { domain: string }) {
  return scoreDomain(args.domain);
}

export function registrationLinksTool(args: { domain: string }) {
  const domain = args.domain.trim().toLowerCase();
  return { domain, ...affiliateLinksFor(domain) };
}

function asText(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    "check_domains",
    {
      title: "Check domain availability",
      description:
        "Check up to 100 domain names against a database of registered domains in a " +
        "single call. Use this after brainstorming candidate names to filter out the " +
        "ones that are already taken. " +
        AVAILABILITY_CAVEAT,
      inputSchema: CHECK_DOMAINS_INPUT,
    },
    async (args) => asText(await checkDomainsTool(args)),
  );

  server.registerTool(
    "score_domain",
    {
      title: "Score a domain name",
      description:
        "Score a domain 0-100 on brandability, with a breakdown across length, " +
        "pronounceability, hyphens, digits, TLD tier and typo risk. Deterministic " +
        "heuristic, not a judgement — use it to break ties between candidates you " +
        "have already checked for availability.",
      inputSchema: SCORE_DOMAIN_INPUT,
    },
    async (args) => asText(scoreDomainTool(args)),
  );

  server.registerTool(
    "get_registration_links",
    {
      title: "Get registration links",
      description:
        "Get GoDaddy and Namecheap registration URLs for a domain. Use this once the " +
        "user has chosen a name they want to register.",
      inputSchema: REGISTRATION_LINKS_INPUT,
    },
    async (args) => asText(registrationLinksTool(args)),
  );
}
