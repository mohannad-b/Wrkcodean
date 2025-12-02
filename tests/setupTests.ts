import "@testing-library/jest-dom";
import { afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";

beforeAll(() => {
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
afterEach(() => {
  cleanup();
});
