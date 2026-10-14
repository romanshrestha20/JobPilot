import { describe, expect, it } from "vitest";
import { readJobForm, toFieldErrors, toJobFormValues } from "./form";

describe("job form helpers", () => {
  it("fills the edit form from a saved job, turning null into empty strings", () => {
    expect(
      toJobFormValues({
        id: "1",
        title: "T",
        company: "C",
        location: null,
        sourceUrl: null,
        description: "D\nE",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ).toEqual({ title: "T", company: "C", location: "", sourceUrl: "", description: "D\nE" });
  });

  it("reads named fields only and ignores everything else", () => {
    const data = new FormData();
    data.append("title", "T");
    data.append("userId", "evil");
    data.append("id", "evil");
    expect(Object.keys(readJobForm(data)).sort()).toEqual([
      "company",
      "description",
      "location",
      "sourceUrl",
      "title",
    ]);
    expect(readJobForm(data).title).toBe("T");
  });

  it("keeps the first message per field", () => {
    expect(
      toFieldErrors([
        { code: "custom", path: ["title"], message: "first" },
        { code: "custom", path: ["title"], message: "second" },
      ]),
    ).toEqual({ title: "first" });
  });
});
