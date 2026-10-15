import { describe, expect, it } from "vitest";
import { parseSkillForm, readSkillForm, toSkillFormValues } from "./form";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

describe("parseSkillForm", () => {
  it("turns empty optional fields into null and numbers into numbers", () => {
    expect(
      parseSkillForm(
        form([
          ["name", "Go"],
          ["level", ""],
          ["yearsOfExperience", " "],
          ["evidence", ""],
        ]),
      ),
    ).toEqual({ name: "Go", level: null, yearsOfExperience: null, evidence: "" });
    expect(
      parseSkillForm(
        form([
          ["name", "Go"],
          ["yearsOfExperience", "3"],
        ]),
      ),
    ).toMatchObject({
      yearsOfExperience: 3,
    });
  });

  it("forwards unparseable numbers as NaN so validation rejects them", () => {
    expect(parseSkillForm(form([["yearsOfExperience", "12abc"]]))).toMatchObject({
      yearsOfExperience: Number.NaN,
    });
  });

  it("never forwards fields it does not know", () => {
    const parsed = parseSkillForm(
      form([
        ["name", "Go"],
        ["userId", "user-bob"],
        ["skillKey", "x"],
        ["id", "y"],
      ]),
    );
    expect(Object.keys(parsed as object).sort()).toEqual([
      "evidence",
      "level",
      "name",
      "yearsOfExperience",
    ]);
  });
});

describe("form values", () => {
  it("reads missing fields as empty strings", () => {
    expect(readSkillForm(new FormData())).toEqual({
      name: "",
      level: "",
      yearsOfExperience: "",
      evidence: "",
    });
  });

  it("round-trips a stored skill", () => {
    expect(
      toSkillFormValues({ name: "Go", level: null, yearsOfExperience: 0, evidence: null }),
    ).toEqual({ name: "Go", level: "", yearsOfExperience: "0", evidence: "" });
  });
});
