import { describe, expect, it } from "vitest";
import { parseProfileForm, toFieldErrors, toFormValues } from "./form";
import { profileInputSchema } from "./validation";

function formData(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("parseProfileForm", () => {
  it("maps named fields and converts types", () => {
    const parsed = parseProfileForm(
      formData([
        ["headline", "Dev"],
        ["yearsOfExperience", "4"],
        ["languages", "English, Nepali ,, "],
        ["workModes", "remote"],
        ["workModes", "hybrid"],
      ]),
    );

    expect(profileInputSchema.parse(parsed)).toMatchObject({
      headline: "Dev",
      yearsOfExperience: 4,
      languages: ["English", "Nepali"],
      workModes: ["remote", "hybrid"],
    });
  });

  it("never forwards fields that are not part of the form, such as userId", () => {
    const parsed = parseProfileForm(
      formData([
        ["userId", "someone-else"],
        ["headline", "Dev"],
      ]),
    );

    expect(parsed).not.toHaveProperty("userId");
    expect(profileInputSchema.safeParse(parsed).success).toBe(true);
  });

  it("turns a non-numeric experience into a validation error", () => {
    const parsed = parseProfileForm(formData([["yearsOfExperience", "lots"]]));

    expect(profileInputSchema.safeParse(parsed).success).toBe(false);
  });
});

describe("toFormValues / toFieldErrors", () => {
  it("renders an empty form for a missing profile", () => {
    expect(toFormValues(null)).toMatchObject({ headline: "", workModes: [] });
  });

  it("keeps the first message per field", () => {
    const result = profileInputSchema.safeParse({
      yearsOfExperience: 200,
      headline: "x".repeat(200),
    });
    if (result.success) throw new Error("expected failure");

    expect(Object.keys(toFieldErrors(result.error.issues)).sort()).toEqual([
      "headline",
      "yearsOfExperience",
    ]);
  });
});
