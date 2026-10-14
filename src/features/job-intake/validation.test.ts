import { describe, expect, it } from "vitest";
import {
  DEFAULT_JOB_STATUS,
  JOB_LIMITS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  jobInputSchema,
  jobStatusInputSchema,
  jobStatusSchema,
  parseJobStatus,
} from "./validation";

const valid = {
  title: "Backend engineer",
  company: "Acme",
  location: "Helsinki",
  sourceUrl: "https://example.com/jobs/1",
  description: "Build services.\nSecond line.",
};

const parse = (overrides: Record<string, unknown> = {}) =>
  jobInputSchema.safeParse({ ...valid, ...overrides });

function firstError(result: ReturnType<typeof parse>, field: string) {
  if (result.success) return undefined;
  return result.error.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("jobInputSchema", () => {
  it("accepts a complete job", () => {
    expect(parse()).toMatchObject({ success: true, data: valid });
  });

  it("accepts only the required fields and turns optional blanks into null", () => {
    const result = jobInputSchema.safeParse({ title: "T", company: "C", description: "D" });
    expect(result).toMatchObject({
      success: true,
      data: { location: null, sourceUrl: null },
    });
    expect(parse({ location: "  ", sourceUrl: "" })).toMatchObject({
      success: true,
      data: { location: null, sourceUrl: null },
    });
  });

  it("trims single-line fields and keeps the description body intact", () => {
    const result = parse({
      title: "  Engineer  ",
      description: "\n  Line one\r\n\r\n    indented line\r\n",
    });
    expect(result).toMatchObject({
      success: true,
      data: { title: "Engineer", description: "Line one\n\n    indented line" },
    });
  });

  it.each(["title", "company", "description"])("requires %s", (field) => {
    expect(firstError(parse({ [field]: "" }), field)).toMatch(/required/i);
    expect(firstError(parse({ [field]: "   \n\t " }), field)).toMatch(/required/i);
    expect(parse({ [field]: undefined }).success).toBe(false);
  });

  it.each([
    ["title", JOB_LIMITS.title],
    ["company", JOB_LIMITS.company],
    ["location", JOB_LIMITS.location],
    ["description", JOB_LIMITS.description],
  ] as const)("accepts %s at its limit and rejects one over", (field, max) => {
    expect(parse({ [field]: "a".repeat(max) }).success).toBe(true);
    expect(firstError(parse({ [field]: "a".repeat(max + 1) }), field)).toMatch(/at most/i);
  });

  it("rejects line breaks and NUL in single-line fields", () => {
    for (const field of ["title", "company", "location"]) {
      expect(parse({ [field]: "a\nb" }).success).toBe(false);
      expect(parse({ [field]: "a\u0000b" }).success).toBe(false);
    }
  });

  it("rejects NUL and other control characters in the description, allows tabs and newlines", () => {
    expect(parse({ description: "a\u0000b" }).success).toBe(false);
    expect(parse({ description: "a\u0007b" }).success).toBe(false);
    expect(parse({ description: "a\tb\nc" }).success).toBe(true);
  });

  it.each([
    "http://example.com",
    "https://example.com/path?q=1#frag",
    "https://example.com:8443/x",
  ])("accepts source URL %s", (url) => {
    expect(parse({ sourceUrl: url }).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "ftp://example.com",
    "//example.com",
    "example.com",
    "https://",
    "not a url",
    "https://exa mple.com",
    "https://user:pass@example.com",
    "https://example.com/\nx",
    "https://example.com/" + "a".repeat(JOB_LIMITS.sourceUrl),
  ])("rejects source URL %j", (url) => {
    expect(parse({ sourceUrl: url }).success).toBe(false);
  });

  it.each(["id", "userId", "user_id", "createdAt", "updatedAt", "extra"])(
    "rejects a client-supplied %s",
    (key) => {
      expect(parse({ [key]: "x" }).success).toBe(false);
    },
  );
});

describe("job status", () => {
  it("has the six statuses in pipeline order, with a label each, defaulting to saved", () => {
    expect([...JOB_STATUSES]).toEqual([
      "saved",
      "applied",
      "interviewing",
      "offered",
      "rejected",
      "withdrawn",
    ]);
    for (const status of JOB_STATUSES) expect(JOB_STATUS_LABELS[status]).toMatch(/^[A-Z]/);
    expect(DEFAULT_JOB_STATUS).toBe("saved");
  });

  it.each(JOB_STATUSES)("accepts %s", (status) => {
    expect(jobStatusSchema.safeParse(status).success).toBe(true);
    expect(jobStatusInputSchema.safeParse({ status }).success).toBe(true);
    expect(parseJobStatus(status)).toBe(status);
  });

  it.each([
    "",
    "Saved",
    "SAVED",
    " saved",
    "saved ",
    "interview",
    "offer",
    "hired",
    "'; drop table job_posting; --",
    "__proto__",
    null,
    undefined,
    0,
    {},
    ["saved"],
  ])("rejects %j", (value) => {
    expect(jobStatusSchema.safeParse(value).success).toBe(false);
    expect(jobStatusInputSchema.safeParse({ status: value }).success).toBe(false);
    expect(parseJobStatus(value)).toBeUndefined();
  });

  it("explains how to fix an invalid status", () => {
    const result = jobStatusInputSchema.safeParse({ status: "nope" });
    expect(!result.success && result.error.issues[0].message).toMatch(/choose a status/i);
  });

  it("requires the status key and rejects forged ownership or unknown fields", () => {
    expect(jobStatusInputSchema.safeParse({}).success).toBe(false);
    for (const key of ["userId", "id", "createdAt", "updatedAt", "title", "extra"]) {
      expect(jobStatusInputSchema.safeParse({ status: "applied", [key]: "x" }).success).toBe(false);
    }
  });

  it("cannot be set through the create or edit input", () => {
    const result = jobInputSchema.safeParse({
      title: "T",
      company: "C",
      description: "D",
      status: "offered",
    });
    expect(result.success).toBe(false);
  });
});
