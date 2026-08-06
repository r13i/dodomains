import { createMcpHandler } from "mcp-handler";

import { registerTools } from "@/src/lib/mcp/tools";

const handler = createMcpHandler(
  (server) => {
    registerTools(server);
  },
  { serverInfo: { name: "dodomains", version: "1.0.0" } },
);

export { handler as GET, handler as POST };

// A batch of 100 domains is one indexed query, but a cold start plus a slow
// connection should not be cut off mid-response.
export const maxDuration = 30;
