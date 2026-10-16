import { describe, expect, it } from "vitest";
import { FAILURE_CODES } from "@/features/job-analysis/domain/analysis-state";
import { EDIT_THEN_RETRY, FAILURE_MESSAGES, quotaMessage } from "./messages";

describe("failure messages", () => {
  it("has a fixed message for every failure code", () => {
    for (const code of FAILURE_CODES) {
      expect(FAILURE_MESSAGES[code], code).toMatch(/\S/);
    }
    expect(Object.keys(FAILURE_MESSAGES).sort()).toEqual([...FAILURE_CODES].sort());
  });

  it("says nothing was saved when a model run failed", () => {
    for (const code of ["provider_unavailable", "timeout", "retries_exhausted"] as const) {
      expect(FAILURE_MESSAGES[code]).toMatch(/nothing was saved/i);
    }
    expect(FAILURE_MESSAGES.invalid_output).toMatch(/discarded/i);
  });

  it("offers editing only for causes the job's text can fix", () => {
    expect([...EDIT_THEN_RETRY].sort()).toEqual(["empty_input", "too_long"]);
  });

  it("names the daily limit", () => {
    expect(quotaMessage(20)).toContain("20");
  });
});
