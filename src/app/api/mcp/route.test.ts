import { describe, expect, it } from "vitest";
import { POST } from "@/src/app/api/mcp/route";

function rpc(body: unknown) {
  return new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/mcp", () => {
  it("lists exactly the three tools, each with a description", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    );
    const text = await res.text();

    for (const name of [
      "check_domains",
      "score_domain",
      "get_registration_links",
    ]) {
      expect(text).toContain(name);
    }
  });

  it("warns in check_domains' description that this is not a registry check", async () => {
    const res = await POST(
      rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    );
    expect(await res.text()).toMatch(/not an authoritative registry/i);
  });
});
