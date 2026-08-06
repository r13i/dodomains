import { describe, expect, it } from "vitest";
import { cn } from "@/src/lib/utils";

describe("cn", () => {
  it("lets a later tailwind class win", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
