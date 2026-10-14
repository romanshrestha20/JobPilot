import { describe, expect, it } from "vitest";
import { profileInputSchema } from "./validation";

describe("profileInputSchema", () => {
  it("accepts a partial update", () => {
    expect(profileInputSchema.parse({ headline: "Engineer" })).toEqual({ headline: "Engineer" });
    expect(profileInputSchema.parse({})).toEqual({});
  });

  it.each([
    ["userId", { userId: "someone-else" }],
    ["id", { id: "00000000-0000-0000-0000-000000000000" }],
    ["createdAt", { createdAt: new Date() }],
    ["an unknown field", { isAdmin: true }],
  ])("rejects protected or unknown field: %s", (_name, input) => {
    expect(profileInputSchema.safeParse(input).success).toBe(false);
  });

  it("trims text and turns empty strings into null", () => {
    expect(profileInputSchema.parse({ headline: "  Dev  ", location: "   " })).toEqual({
      headline: "Dev",
      location: null,
    });
  });

  it("enforces length and range limits", () => {
    expect(profileInputSchema.safeParse({ headline: "x".repeat(121) }).success).toBe(false);
    expect(profileInputSchema.safeParse({ summary: "x".repeat(2001) }).success).toBe(false);
    expect(profileInputSchema.safeParse({ yearsOfExperience: -1 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ yearsOfExperience: 61 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ yearsOfExperience: 2.5 }).success).toBe(false);
    expect(profileInputSchema.safeParse({ yearsOfExperience: Number.NaN }).success).toBe(false);
    expect(profileInputSchema.parse({ yearsOfExperience: null })).toEqual({
      yearsOfExperience: null,
    });
  });

  it("restricts work modes and removes duplicates", () => {
    expect(profileInputSchema.safeParse({ workModes: ["teleport"] }).success).toBe(false);
    expect(profileInputSchema.parse({ workModes: ["remote", "remote", "hybrid"] })).toEqual({
      workModes: ["remote", "hybrid"],
    });
  });

  it("rejects blank languages and caps the list", () => {
    expect(profileInputSchema.safeParse({ languages: ["English", " "] }).success).toBe(false);
    expect(
      profileInputSchema.safeParse({ languages: Array.from({ length: 21 }, (_, i) => `L${i}`) })
        .success,
    ).toBe(false);
  });
});
