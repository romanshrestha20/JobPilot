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

const matching = sourceFiles("src/features/job-matching");
const matchPath = [
  ...matching,
  "src/app/(app)/jobs/[id]/_analysis/match-panel.tsx",
  "src/app/(app)/jobs/[id]/_analysis/match-presentation.ts",
];

describe("match path boundaries (candidate data stays local)", () => {
  it("never imports the AI gateway, a provider, the extraction use case, the queue or pg-boss", () => {
    for (const file of matchPath) {
      for (const specifier of importsOf(read(file))) {
        expect(specifier, file).not.toMatch(
          /^@\/lib\/ai|^@\/lib\/queue$|^pg-boss$|\/application\/(extract|analysis-queue|process-analysis)$/,
        );
      }
      // The public index also exports the extractor and queue helpers; the match path must not name them.
      expect(read(file), file).not.toMatch(
        /extractJobRequirements|createAnalysisQueue|createProducerQueue|createWorkerQueue|createProcessor|createAnalysisProcessor|createConfiguredGateway/,
      );
    }
  });

  it("the match service file is pure: types only, no runtime imports", () => {
    const source = read("src/features/job-matching/application/match-service.ts");
    expect(source).not.toMatch(/^import (?!type)/m);
  });

  it("the composition root refuses to enqueue", () => {
    const source = read("src/features/job-matching/index.ts");
    expect(source).toMatch(/cannot enqueue/);
  });

  it("job-analysis still imports no candidate-profile or identity code", () => {
    for (const file of sourceFiles("src/features/job-analysis")) {
      for (const specifier of importsOf(read(file))) {
        expect(specifier, file).not.toMatch(/candidate-profile|candidate_skill|identity/);
      }
    }
  });

  it("only the matching module reads candidate profile data on the analysis page", () => {
    for (const file of sourceFiles("src/app/(app)/jobs/[id]")) {
      for (const specifier of importsOf(read(file))) {
        expect(specifier, file).not.toMatch(/candidate-profile|candidate_skill/);
      }
    }
  });

  it("the worker, queue and AI layer never import the matching or profile modules", () => {
    const guarded = [
      ...sourceFiles("src/worker"),
      ...sourceFiles("src/lib/ai"),
      "src/lib/queue.ts",
    ];
    for (const file of guarded) {
      for (const specifier of importsOf(read(file))) {
        expect(specifier, file).not.toMatch(/job-matching|candidate-profile|candidate_skill/);
      }
    }
  });

  it("matching imports candidate-profile and job-analysis only through their public index", () => {
    for (const file of matching) {
      for (const specifier of importsOf(read(file))) {
        if (/^@\/features\/(candidate-profile|job-analysis)/.test(specifier)) {
          expect(specifier, file).toMatch(/^@\/features\/(candidate-profile|job-analysis)$/);
        }
      }
    }
  });
});
