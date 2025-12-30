import fs from "node:fs";
import path from "node:path";

function walk(dir: string, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist" || entry.name === "coverage" || entry.name === "build") {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("lifecycle single source of truth", () => {
  it("uses lifecycle module instead of legacy build-status helpers", () => {
    const allowList = new Set([
      "lib/submissions/lifecycle.ts",
      "lib/build-status/types.ts",
      "tests/regression/lifecycle-source.test.ts",
    ]);
    const root = process.cwd();
    const files = walk(root);
    const offenders: string[] = [];
    for (const absolute of files) {
      const normalized = absolute.replace(root + path.sep, "").replace(/\\/g, "/");
      if (allowList.has(normalized)) continue;
      const content = fs.readFileSync(absolute, "utf8");
      if (content.includes('from "@/lib/build-status/types"')) {
        offenders.push(normalized);
      }
    }
    expect(offenders).toEqual([]);
  });
});


