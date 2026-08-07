import PostHogClient from "@/src/lib/posthog";

/**
 * Server-side analytics for the MCP surface.
 *
 * Three rules this module exists to keep:
 *
 * 1. **Never send a domain name.** The domains an agent checks are the
 *    caller's unreleased product idea, exactly like the keywords typed into
 *    the website. Counts and outcomes only.
 * 2. **Never break a tool call.** Analytics is best-effort. Every failure is
 *    swallowed; a PostHog outage must not turn into an MCP error.
 * 3. **Flush before returning.** A serverless function can freeze the moment
 *    it responds, so a buffered event would be lost. `PostHogClient` is
 *    configured with `flushAt: 1, flushInterval: 0` and we await `shutdown()`.
 *
 * MCP callers are anonymous and we do not fingerprint them, so every event
 * shares one distinct id. That makes event counts meaningful and unique-user
 * counts meaningless — which is the honest trade for an unauthenticated
 * endpoint.
 */
const MCP_DISTINCT_ID = "mcp-anonymous";

/**
 * Flushing is on the response path, so a slow PostHog would become a slow MCP
 * tool call. Cap the wait and give up rather than make the caller pay for it.
 */
const FLUSH_TIMEOUT_MS = 2000;

export async function captureMcpToolCall(
  tool: string,
  properties: Record<string, string | number | boolean> = {},
): Promise<void> {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;

  try {
    const client = PostHogClient();
    client.capture({
      distinctId: MCP_DISTINCT_ID,
      event: "mcp_tool_called",
      properties: { tool, ...properties },
    });
    await Promise.race([
      client.shutdown(),
      new Promise((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS)),
    ]);
  } catch {
    // Best-effort by design. See rule 2 above.
  }
}
