import { describe, expect, it } from "vitest";
import { __test } from "../../../lib/ai/copilot-trace";

const { sanitizeMeta } = __test;

describe("sanitizeMeta", () => {
  it("redacts token-like strings", () => {
    const { meta, metaTruncated } = sanitizeMeta({ tokenLike: "a".repeat(32) });
    expect(meta?.tokenLike).toBe("[REDACTED_TOKEN]");
    expect(metaTruncated).toBe(true);
  });

  it("redacts emails", () => {
    const { meta, metaTruncated } = sanitizeMeta({ email: "user@example.com" });
    expect(meta?.email).toBe("[REDACTED_EMAIL]");
    expect(metaTruncated).toBe(true);
  });

  it("redacts sensitive keys", () => {
    const { meta, metaTruncated } = sanitizeMeta({ authorization: "Bearer abc123" });
    expect(meta?.authorization).toBe("[REDACTED]");
    expect(metaTruncated).toBe(true);
  });

  it("caps arrays and marks truncated", () => {
    const bigArray = Array.from({ length: 15 }, (_, i) => `item-${i}`);
    const { meta, metaTruncated } = sanitizeMeta({ arr: bigArray });
    expect((meta?.arr as unknown[]).length).toBe(10);
    expect(metaTruncated).toBe(true);
  });

  it("truncates huge meta and sets metaTruncated flag", () => {
    const { meta, metaTruncated } = sanitizeMeta({ huge: "x".repeat(6000) });
    expect(metaTruncated).toBe(true);
    expect(meta).toEqual({ metaTruncated: true });
  });

  it("handles non-serializable values safely", () => {
    const circular: any = {};
    circular.self = circular;
    const { meta, metaTruncated } = sanitizeMeta({ circular });
    expect(metaTruncated).toBe(true);
    expect(meta).toEqual({ metaTruncated: true });
  });
});

