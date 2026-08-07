import { createMcpHandler } from "mcp-handler";

import { registerTools } from "@/src/lib/mcp/tools";

const inner = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  { serverInfo: { name: "dodomains", version: "1.0.0" } },
);

async function handler(request: Request) {
  if (request.method !== "POST") return inner(request);

  // The per-call caps in src/lib/mcp/tools.ts are enforced per tools/call.
  // A JSON-RPC array body fans out concurrently and multiplies them by the
  // number of calls it contains, which no request-counting rate limit can
  // see. MCP revision 2025-06-18 — the version this server advertises —
  // removed batching, so rejecting it is protocol-correct.
  const body = await request.text();
  if (body.trimStart().startsWith("[")) {
    return Response.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "JSON-RPC batching is not supported" },
      },
      { status: 400 },
    );
  }

  return inner(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body,
    }),
  );
}

export { handler as GET, handler as POST };

// A batch of 100 domains is one indexed query, but a cold start plus a slow
// connection should not be cut off mid-response.
export const maxDuration = 30;
