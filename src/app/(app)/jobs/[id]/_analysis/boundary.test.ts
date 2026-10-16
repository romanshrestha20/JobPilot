import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIR = "src/app/(app)/jobs/[id]/_analysis";
const files = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name));
const importsOf = (path: string) =>
  [...readFileSync(path, "utf8").matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);

describe("analysis UI boundaries", () => {
  it("never reads candidate profile or skill data, so none can reach a model request", () => {
    for (const name of files) {
      for (const specifier of importsOf(join(DIR, name))) {
        expect(specifier, name).not.toMatch(/candidate-profile|candidate_skill/);
      }
    }
  });

  it("only the action touches identity, and only to authenticate", () => {
    for (const name of files) {
      const identity = importsOf(join(DIR, name)).filter((s) => s.includes("identity"));
      if (name === "actions.ts") expect(identity).toEqual(["@/features/identity/server"]);
      else expect(identity, name).toEqual([]);
    }
  });

  it("client components import no server code, database or queue", () => {
    for (const name of files) {
      const source = readFileSync(join(DIR, name), "utf8");
      if (!source.startsWith('"use client"')) continue;
      for (const specifier of importsOf(join(DIR, name))) {
        expect(specifier, name).not.toMatch(
          /^@\/lib\/(db|env|queue)$|\.\/server$|job-intake|pg-boss/,
        );
      }
    }
  });
});
