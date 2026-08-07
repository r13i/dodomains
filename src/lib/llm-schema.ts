import { z } from "zod";

import { getProvider } from "@/src/lib/providers";

/**
 * Hostnames and IP ranges the server must never be asked to call.
 *
 * `baseUrl` is attacker-controlled on two public unauthenticated routes, and
 * the request is made *from our server*. Without this, anyone could use the
 * error codes as an oracle to probe our egress network — cloud metadata at
 * 169.254.169.254, internal services on RFC1918, databases on loopback.
 *
 * This costs nothing in functionality: a private address reaching our server
 * resolves to *our* network, never the caller's, so a visitor pointing this at
 * their own machine could never have worked in the first place.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) {
    return true;
  }
  // IPv6 loopback and unique-local / link-local.
  if (
    h === "::1" ||
    h === "::" ||
    /^f[cd][0-9a-f]{2}:/.test(h) ||
    /^fe80:/.test(h)
  ) {
    return true;
  }
  // IPv4-mapped IPv6, e.g. ::ffff:127.0.0.1 — unwrap and re-check.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (mapped) return isBlockedHost(mapped[1]);

  // The URL parser normalises ::ffff:127.0.0.1 to its hex form ::ffff:7f00:1,
  // so the dotted-quad branch above never sees it. Expand and re-check.
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    return isBlockedHost(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!v4) return false;

  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 0 || a === 10) return true; // loopback, this-host, private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

/**
 * Validation for caller-supplied LLM credentials. Shared by /api/generate and
 * /api/test-connection so the two can never drift — they validate the same
 * secret-bearing payload.
 */
export const llmSchema = z
  .object({
    provider: z.string().min(1),
    model: z.string().min(1).max(100),
    apiKey: z.string().min(1).max(500),
    baseUrl: z
      .url()
      .max(300)
      .refine(
        (u) => {
          try {
            return ["http:", "https:"].includes(new URL(u).protocol);
          } catch {
            return false;
          }
        },
        { error: "Base URL must use http or https" },
      )
      .refine(
        (u) => {
          try {
            return !isBlockedHost(new URL(u).hostname);
          } catch {
            return false;
          }
        },
        {
          error:
            "Base URL must be a public address. A private or local address would resolve on our servers, not yours.",
        },
      )
      .optional(),
  })
  .refine((l) => Boolean(getProvider(l.provider)), {
    error: "Unknown provider",
    path: ["provider"],
  })
  .refine((l) => !getProvider(l.provider)?.needsBaseUrl || Boolean(l.baseUrl), {
    error: "A base URL is required for a custom provider",
    path: ["baseUrl"],
  });
