import { describe, expect, it } from "vitest";
import { foldPlace, placeAppearsIn } from "./location-match";

describe("foldPlace", () => {
  it("removes accents and case and collapses punctuation", () => {
    expect(foldPlace("  Zürich,  CH ")).toBe("zurich ch");
    expect(foldPlace("São Paulo")).toBe("sao paulo");
    expect(foldPlace("St. John's")).toBe("st john s");
  });
});

describe("placeAppearsIn", () => {
  it("finds a place as whole words in a longer location", () => {
    expect(placeAppearsIn("Helsinki", "Helsinki, Finland")).toBe(true);
    expect(placeAppearsIn("helsinki", "HELSINKI")).toBe(true);
    expect(placeAppearsIn("Zurich", "Zürich")).toBe(true);
  });

  it("does not match inside a longer word", () => {
    expect(placeAppearsIn("Oslo", "Moslo")).toBe(false);
    expect(placeAppearsIn("Rome", "Romeo")).toBe(false);
  });

  it("does not match when the job names more than the profile does", () => {
    expect(placeAppearsIn("Helsinki, Finland", "Helsinki")).toBe(false);
  });

  it("an empty or punctuation-only place never matches", () => {
    expect(placeAppearsIn("", "Helsinki")).toBe(false);
    expect(placeAppearsIn(" , ", "Helsinki")).toBe(false);
  });
});
