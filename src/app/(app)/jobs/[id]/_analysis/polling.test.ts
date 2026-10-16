import { describe, expect, it } from "vitest";
import { POLL_GIVE_UP_MS, nextPollDelay } from "./polling";

describe("nextPollDelay", () => {
  it("polls quickly at first, then slows down", () => {
    expect(nextPollDelay(0)).toBe(2_000);
    expect(nextPollDelay(29_999)).toBe(2_000);
    expect(nextPollDelay(30_000)).toBe(5_000);
    expect(nextPollDelay(POLL_GIVE_UP_MS - 1)).toBe(5_000);
  });

  it("gives up after the limit so a stuck run does not poll forever", () => {
    expect(nextPollDelay(POLL_GIVE_UP_MS)).toBeNull();
    expect(nextPollDelay(POLL_GIVE_UP_MS * 2)).toBeNull();
  });
});
