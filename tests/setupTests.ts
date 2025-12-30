import "@testing-library/jest-dom";
import { afterEach, beforeAll, vi } from "vitest";
import { cleanup } from "@testing-library/react";

const enableAgentLog = false;

beforeAll(() => {
  // #region agent log
  if (enableAgentLog && typeof fetch === "function" && !vi.isMockFunction(fetch)) {
    const maybePromise = fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "H-env",
        location: "tests/setupTests.ts:beforeAll",
        message: "Test runner boot",
        data: {
          nodeEnv: process.env.NODE_ENV ?? "unset",
          hasRedisUrl: Boolean(process.env.REDIS_URL),
          hasAuth0Secret: Boolean(process.env.AUTH0_SECRET),
          hasDbUrl: Boolean(process.env.DATABASE_URL),
        },
        timestamp: Date.now(),
      }),
    });
    if (maybePromise && typeof (maybePromise as any).catch === "function") {
      (maybePromise as any).catch(() => {});
    }
  }
  // #endregion
  if (!("scrollIntoView" in Element.prototype)) {
    // @ts-expect-error jsdom polyfill for scrollIntoView
    Element.prototype.scrollIntoView = () => {};
  }
  if (typeof window.ResizeObserver === "undefined") {
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

// Cleanup after each test
afterEach((context) => {
  // #region agent log
  if (enableAgentLog && typeof fetch === "function" && !vi.isMockFunction(fetch)) {
    const maybePromise = fetch("http://127.0.0.1:7243/ingest/ab856c53-a41f-49e1-b192-03a8091a4fdc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "H-results",
        location: "tests/setupTests.ts:afterEach",
        message: "Test case finished",
        data: {
          taskName: context.task.name,
          mode: context.task.mode,
          state: context.task.result?.state ?? "unknown",
          durationMs: context.task.result?.duration ?? null,
          errors: context.task.result?.errors?.map((e) => e.message)?.slice(0, 3) ?? [],
        },
        timestamp: Date.now(),
      }),
    });
    if (maybePromise && typeof (maybePromise as any).catch === "function") {
      (maybePromise as any).catch(() => {});
    }
  }
  // #endregion
  cleanup();
});
