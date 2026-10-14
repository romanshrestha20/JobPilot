import { describe, expect, it } from "vitest";
import { safeNextPath, signInUrlFor, withNext } from "./safe-redirect";

describe("safeNextPath", () => {
  it.each([
    ["/profile", "/profile"],
    ["/profile?tab=cv#top", "/profile?tab=cv#top"],
    ["/jobs/123", "/jobs/123"],
    ["/signature", "/signature"], // looks like /sign-… but is a different route
    ["/a/./b", "/a/b"],
  ])("keeps a safe relative path: %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });

  it.each([
    "https://evil.example",
    "http://evil.example/x",
    "//evil.example",
    "//evil.example/path",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "/\\/evil.example",
    "/%5Cevil.example/..", // decoded by the URL parser to a path, still same origin → checked below
    "javascript:alert(1)",
    "data:text/html,hi",
    "profile",
    "",
    "   ",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r//evil.example",
    "/\u0000x",
    "/ok\u007f",
    "/" + "a".repeat(600),
  ])("falls back for an unsafe value: %j", (input) => {
    const result = safeNextPath(input);
    // The only acceptable outcomes are the fallback or a same-origin path on this site.
    expect(result.startsWith("/")).toBe(true);
    expect(result.startsWith("//")).toBe(false);
    expect(result.includes("\\")).toBe(false);
    if (input !== "/%5Cevil.example/..") expect(result).toBe("/");
  });

  it("falls back for non-strings", () => {
    for (const v of [null, undefined, 42, {}, ["/profile"], true]) {
      expect(safeNextPath(v)).toBe("/");
    }
  });

  it("falls back for malformed encodings without throwing", () => {
    expect(safeNextPath("/%E0%A4%A")).toBe("/%E0%A4%A"); // opaque path text, not a redirect risk
    expect(safeNextPath("http://[::1")).toBe("/");
  });

  it.each([
    "/sign-in",
    "/sign-in?next=/profile",
    "/sign-up",
    "/sign-in/",
    "/sign-in#x",
    "/api/auth/get-session",
    "/api",
  ])("rejects auth and API paths to avoid loops: %s", (input) => {
    expect(safeNextPath(input)).toBe("/");
  });

  it("uses the supplied fallback", () => {
    expect(safeNextPath("//evil.example", "/home")).toBe("/home");
    expect(safeNextPath(undefined, "")).toBe("");
  });
});

describe("signInUrlFor", () => {
  it("preserves a protected destination, encoded", () => {
    expect(signInUrlFor("/profile?tab=cv")).toBe("/sign-in?next=%2Fprofile%3Ftab%3Dcv");
  });

  it("omits next for unsafe or loop targets", () => {
    expect(signInUrlFor("/sign-in")).toBe("/sign-in");
    expect(signInUrlFor("//evil.example")).toBe("/sign-in");
  });
});

describe("withNext", () => {
  it("carries a non-default destination between auth screens", () => {
    expect(withNext("/sign-up", "/profile")).toBe("/sign-up?next=%2Fprofile");
    expect(withNext("/sign-in", "/")).toBe("/sign-in");
  });
});
