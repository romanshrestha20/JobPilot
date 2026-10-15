import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

const read = (path: string) => readFileSync(path, "utf8");
const importsOf = (source: string) =>
  [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("Phase 2A boundaries", () => {
  const aiFiles = sourceFiles("src/lib/ai");
  const analysisFiles = sourceFiles("src/features/job-analysis");

  it("the AI layer and job-analysis never import candidate profile or skill code", () => {
    for (const file of [...aiFiles, ...analysisFiles]) {
      for (const specifier of importsOf(read(file))) {
        expect(specifier, file).not.toMatch(/candidate-profile|candidate_skill|identity/);
      }
    }
  });

  it("the AI layer and job-analysis never import the database or schema", () => {
    for (const file of [...aiFiles, ...analysisFiles]) {
      for (const specifier of importsOf(read(file))) {
        expect(specifier, file).not.toMatch(/^@\/lib\/(db|schema)$|drizzle|^postgres$/);
      }
    }
  });

  it("job-analysis imports no other feature and no framework code", () => {
    for (const file of analysisFiles) {
      for (const specifier of importsOf(read(file))) {
        expect(specifier, file).not.toMatch(/^@\/features\/|^next(\/|$)|^react/);
      }
    }
  });

  it("only the composition files import server-only or the environment", () => {
    const allowed = new Set(["src/lib/ai/index.ts", "src/features/job-analysis/index.ts"]);
    for (const file of [...aiFiles, ...analysisFiles]) {
      const specifiers = importsOf(read(file));
      const hasServerOnly = /import\s+["']server-only["']/.test(read(file));
      const usesEnv = specifiers.includes("@/lib/env");
      if (allowed.has(file)) continue;
      expect(hasServerOnly || usesEnv, file).toBe(false);
    }
  });

  it("adds no queue, worker or persistence code in Phase 2A", () => {
    for (const file of [...aiFiles, ...analysisFiles]) {
      expect(read(file), file).not.toMatch(/pg-boss|pgboss|from\s+["']postgres["']/);
    }
  });
});
