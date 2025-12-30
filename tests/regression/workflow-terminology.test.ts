import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const repoRoot = path.join(process.cwd());
const textExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".md", ".json"]);
const ignoreDirs = new Set(["node_modules", ".next", ".git", "terminals"]);

function walkFiles(startDir: string, visitor: (filePath: string) => void) {
  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if (ignoreDirs.has(entry.name)) continue;
    const fullPath = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, visitor);
    } else if (textExtensions.has(path.extname(entry.name))) {
      visitor(fullPath);
    }
  }
}

describe("workflow terminology regression guard", () => {
  it("does not use deprecated blueprint imports", () => {
    const offenders: string[] = [];
    walkFiles(repoRoot, (filePath) => {
      // Allow the shim wrappers in lib/blueprint/**
      if (filePath.includes(`${path.sep}lib${path.sep}blueprint${path.sep}`)) {
        return;
      }
      if (path.relative(repoRoot, filePath) === "tests/regression/workflow-terminology.test.ts") {
        return;
      }
      const content = fs.readFileSync(filePath, "utf8");
      if (content.includes("@/lib/blueprint")) {
        offenders.push(path.relative(repoRoot, filePath));
      }
    });
    expect(offenders).toEqual([]);
  });

  it("keeps UI copy on workflows", () => {
    const offenders: string[] = [];
    ["app", "components"].forEach((dir) => {
      const uiRoot = path.join(repoRoot, dir);
      if (!fs.existsSync(uiRoot)) return;
      walkFiles(uiRoot, (filePath) => {
        const ext = path.extname(filePath);
        if (![".tsx", ".mdx"].includes(ext)) {
          return;
        }
        const content = fs.readFileSync(filePath, "utf8");
        if (content.includes("Blueprint")) {
          offenders.push(path.relative(repoRoot, filePath));
        }
      });
    });
    expect(offenders).toEqual([]);
  });
});

