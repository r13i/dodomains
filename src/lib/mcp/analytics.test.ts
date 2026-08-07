import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { capture, shutdown, ctor } = vi.hoisted(() => ({
  capture: vi.fn(),
  shutdown: vi.fn(async () => {}),
  ctor: vi.fn(),
}));

vi.mock("@/src/lib/posthog", () => ({
  default: () => {
    ctor();
    return { capture, shutdown };
  },
}));

import { captureMcpToolCall } from "@/src/lib/mcp/analytics";

const TOKEN = "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";
const original = process.env[TOKEN];

beforeEach(() => {
  process.env[TOKEN] = "phc_test";
});

afterEach(() => {
  if (original === undefined) delete process.env[TOKEN];
  else process.env[TOKEN] = original;
  capture.mockReset();
  shutdown.mockReset().mockResolvedValue(undefined);
  ctor.mockReset();
});

describe("captureMcpToolCall", () => {
  it("sends the event with the tool name and the given properties", async () => {
    await captureMcpToolCall("check_domains", {
      requested_count: 10,
      available_count: 3,
    });

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture.mock.calls[0][0]).toMatchObject({
      event: "mcp_tool_called",
      properties: {
        tool: "check_domains",
        requested_count: 10,
        available_count: 3,
      },
    });
  });

  it("flushes before returning, so a serverless freeze cannot drop the event", async () => {
    await captureMcpToolCall("score_domain", { score: 90 });
    expect(shutdown).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no PostHog token is configured", async () => {
    delete process.env[TOKEN];
    await captureMcpToolCall("score_domain", { score: 90 });
    expect(ctor).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("never rejects when PostHog throws", async () => {
    capture.mockImplementationOnce(() => {
      throw new Error("posthog is down");
    });
    await expect(
      captureMcpToolCall("check_domains", { requested_count: 1 }),
    ).resolves.toBeUndefined();
  });

  it("never rejects when the flush fails", async () => {
    shutdown.mockRejectedValueOnce(new Error("network"));
    await expect(
      captureMcpToolCall("check_domains", { requested_count: 1 }),
    ).resolves.toBeUndefined();
  });

  it("gives up on a hanging flush instead of stalling the tool call", async () => {
    vi.useFakeTimers();
    shutdown.mockImplementationOnce(() => new Promise(() => {}));

    let settled = false;
    const p = captureMcpToolCall("check_domains", { requested_count: 1 }).then(
      () => {
        settled = true;
      },
    );

    await vi.advanceTimersByTimeAsync(2100);
    await p;

    expect(settled).toBe(true);
    vi.useRealTimers();
  });
});

describe("tool handlers never send a domain name", () => {
  it("records only counts and the TLD across every tool", async () => {
    const { registerTools } = await import("@/src/lib/mcp/tools");

    const handlers: Record<string, (a: never) => Promise<unknown>> = {};
    const server = {
      registerTool: (
        name: string,
        _cfg: unknown,
        cb: (a: never) => Promise<unknown>,
      ) => {
        handlers[name] = cb;
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerTools(server as any);

    const secret = "supersecretstartupname";
    await handlers.score_domain({ domain: `${secret}.com` } as never);
    await handlers.get_registration_links({ domain: `${secret}.com` } as never);

    const sent = JSON.stringify(capture.mock.calls);
    expect(sent).not.toContain(secret);
    expect(sent).toContain("score_domain");
    expect(sent).toContain("get_registration_links");
    // The TLD alone is not identifying and is worth having.
    expect(sent).toContain("com");
  });
});
