import { describe, expect, it } from "vitest";
import { NAV_GROUPS, type NavItem, getNavState } from "./nav-items";

const home: NavItem = { label: "Home", href: "/", icon: "home", match: "exact" };
const jobs: NavItem = { label: "My jobs", href: "/jobs", icon: "briefcase", match: "section" };

describe("getNavState", () => {
  it("marks the exact page", () => {
    expect(getNavState("/", home)).toBe("page");
    expect(getNavState("/jobs", jobs)).toBe("page");
    expect(getNavState("/jobs/", jobs)).toBe("page"); // trailing slash
  });

  it("marks a section as the ancestor of nested routes", () => {
    for (const path of ["/jobs/new", "/jobs/0d9f", "/jobs/0d9f/edit"]) {
      expect(getNavState(path, jobs), path).toBe("section");
    }
  });

  it("does not treat Home as the parent of every route", () => {
    expect(getNavState("/jobs", home)).toBeNull();
    expect(getNavState("/profile", home)).toBeNull();
  });

  it("does not match lookalike paths or unknown pathnames", () => {
    for (const path of ["/jobsx", "/job", "/jobs-archive", "/x/jobs"]) {
      expect(getNavState(path, jobs), path).toBeNull();
    }
    expect(getNavState(null, jobs)).toBeNull();
  });
});

describe("NAV_GROUPS", () => {
  const items = NAV_GROUPS.flatMap((group) => group.items);

  it("has no empty groups, duplicate destinations or non-root-relative links", () => {
    for (const group of NAV_GROUPS) expect(group.items.length, group.label).toBeGreaterThan(0);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
    for (const item of items) expect(item.href.startsWith("/"), item.href).toBe(true);
  });
});
