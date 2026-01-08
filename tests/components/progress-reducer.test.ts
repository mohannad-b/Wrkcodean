import { describe, expect, it } from "vitest";
import { appendDisplayLine, normalizeProgressLine } from "@/components/automations/progress-reducer";

describe("progress reducer", () => {
  it("dedupes normalized last line", () => {
    const existing = ["Saving..."];
    const next = appendDisplayLine(existing, "saving …");
    expect(next).toEqual(existing);
  });

  it("dedupes if already exists anywhere in the list", () => {
    const existing = ["Drafting steps", "Saving draft"];
    const next = appendDisplayLine(existing, "saving draft");
    expect(next).toEqual(existing);
  });

  it("caps at max (drops oldest)", () => {
    const existing = ["1", "2", "3"];
    const next = appendDisplayLine(existing, "4", { max: 3 });
    expect(next).toEqual(["2", "3", "4"]);
  });

  it("does not reset when phase changes (appends)", () => {
    const existing = ["Drafting steps"];
    const next = appendDisplayLine(existing, "Renumbering + validating…");
    expect(next).toEqual(["Drafting steps", "Renumbering + validating…"]);
  });

  it("applies default cap of 8", () => {
    let lines: string[] = [];
    for (let i = 0; i < 10; i++) {
      lines = appendDisplayLine(lines, `Line ${i}`);
    }
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe("Line 2");
    expect(lines[7]).toBe("Line 9");
  });

  it("preserves intent line when capping", () => {
    const intent = "Got it — Updating workflow";
    let lines: string[] = [intent];
    for (let i = 0; i < 10; i++) {
      lines = appendDisplayLine(lines, `Line ${i}`);
    }
    expect(lines).toContain(intent);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines[0]).toBe(intent);
  });

  it("preserves terminal line when capping", () => {
    const intent = "Got it — Updating workflow";
    const terminal = "Saved. Ready for review.";
    let lines: string[] = [intent];
    for (let i = 0; i < 10; i++) {
      lines = appendDisplayLine(lines, `Line ${i}`);
    }
    lines = appendDisplayLine(lines, terminal);
    expect(lines).toContain(intent);
    expect(lines).toContain(terminal);
    expect(lines.length).toBeLessThanOrEqual(8);
    expect(lines[lines.length - 1]).toBe(terminal);
  });

  it("normalizes ellipsis and whitespace", () => {
    expect(normalizeProgressLine("Saving …  ")).toBe("Saving...");
  });
});

