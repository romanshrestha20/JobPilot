import { describe, expect, it } from "vitest";
import { assertSafeTestDatabaseUrl } from "./database-guard";

const DEV = "postgresql://user:secret-pass@localhost:5433/jobpilot";
const OK = "postgresql://u:p@localhost:5433/jobpilot_test";

describe("assertSafeTestDatabaseUrl", () => {
  it("accepts a local *_test database", () => {
    expect(assertSafeTestDatabaseUrl(OK, [DEV])).toBe(OK);
    expect(assertSafeTestDatabaseUrl("postgres://u:p@127.0.0.1:5432/app_test")).toContain(
      "app_test",
    );
    expect(assertSafeTestDatabaseUrl("postgresql://u:p@LOCALHOST:5433/jobpilot_test")).toContain(
      "jobpilot_test",
    );
  });

  it("requires TEST_DATABASE_URL", () => {
    expect(() => assertSafeTestDatabaseUrl(undefined)).toThrow("TEST_DATABASE_URL is not set");
    expect(() => assertSafeTestDatabaseUrl("")).toThrow("TEST_DATABASE_URL is not set");
  });

  it("refuses the development or production database name", () => {
    expect(() => assertSafeTestDatabaseUrl(DEV)).toThrow(
      "must be a plain identifier ending in _test",
    );
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@localhost:5433/jobpilot_prod"),
    ).toThrow("ending in _test");
    expect(() => assertSafeTestDatabaseUrl("postgresql://u:p@localhost:5433/")).toThrow("_test");
    expect(() => assertSafeTestDatabaseUrl("postgresql://u:p@localhost:5433")).toThrow("_test");
  });

  it.each([
    "postgresql://u:p@db.example.com:5432/x_test",
    "postgresql://u:p@10.0.0.5:5432/x_test",
    "postgresql://u:p@localhost.:5433/x_test",
    "postgresql://u:p@localhost.example.com:5433/x_test",
    "postgresql://u:p@127.1:5433/x_test",
    "postgresql://u:p@0x7f.0.0.1:5433/x_test",
    "postgresql://u:p@[::1]:5433/x_test",
    "postgresql://u:p@localhost,db.example.com:5433/x_test",
    "postgresql://u:p@db.example.com,localhost:5433/x_test",
    "postgresql:///x_test",
  ])("refuses non-local or unusual hosts: %s", (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow(/non-local host/);
  });

  it.each([
    `${OK}?host=db.example.com`,
    `${OK}?port=6543`,
    `${OK}?dbname=jobpilot`,
    `${OK}?database=jobpilot`,
    `${OK}?user=admin`,
    `${OK}?options=-c%20search_path%3Dpublic`,
    `${OK}?sslmode=disable`,
    `${OK}#jobpilot`,
    "postgresql:///x_test?host=/var/run/postgresql",
  ])("refuses query parameters and fragments: %s", (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow(/query parameters|non-local host/);
  });

  it.each([
    "postgresql://u:p@localhost:5433/jobpilot%5Ftest",
    "postgresql://u:p@localhost:5433/job%70ilot_test",
    "postgresql://u:p@localhost:5433/jobpilot/x_test",
    "postgresql://u:p@localhost:5433/jobpilot_test/",
    "postgresql://u:p@localhost:5433/jobpilot_test%20",
    "postgresql://u:p@localhost:5433/jobpilot-test",
    "postgresql://u:p@localhost:5433/jobpilot_TEST",
    "postgresql://u:p@localhost:5433/_test",
  ])("refuses database names that are not a plain *_test identifier: %s", (url) => {
    expect(() => assertSafeTestDatabaseUrl(url)).toThrow(/plain identifier/);
  });

  it("refuses a URL identical to a protected URL, including localhost aliases and default ports", () => {
    expect(() => assertSafeTestDatabaseUrl(OK, [OK])).toThrow("same database as DATABASE_URL");
    expect(() =>
      assertSafeTestDatabaseUrl(OK, ["postgresql://other:creds@127.0.0.1:5433/jobpilot_test"]),
    ).toThrow("same database as DATABASE_URL");
    expect(() =>
      assertSafeTestDatabaseUrl("postgresql://u:p@localhost/app_test", [
        "postgresql://u:p@localhost:5432/app_test",
      ]),
    ).toThrow("same database as DATABASE_URL");
  });

  it("ignores protected URLs that are different, unset, or unparsable", () => {
    expect(() => assertSafeTestDatabaseUrl(OK, [undefined, "", "not a url", DEV])).not.toThrow();
    expect(() =>
      assertSafeTestDatabaseUrl(OK, ["postgresql://u:p@localhost:5434/jobpilot_test"]),
    ).not.toThrow();
  });

  it("rejects malformed and non-postgres URLs", () => {
    expect(() => assertSafeTestDatabaseUrl("not a url")).toThrow("not a valid URL");
    expect(() => assertSafeTestDatabaseUrl("localhost:5433/x_test")).toThrow();
    expect(() => assertSafeTestDatabaseUrl("mysql://u:p@localhost:3306/x_test")).toThrow(
      "postgres://",
    );
    expect(() => assertSafeTestDatabaseUrl("http://localhost/x_test")).toThrow("postgres://");
  });

  it("never puts credentials in an error message", () => {
    const attempts = [
      DEV,
      "postgresql://u:secret-pass@db.example.com:5432/x_test",
      "postgresql://u:secret-pass@localhost:5433/x_test?host=evil",
      "postgresql://u:secret-pass@localhost:5433/bad%20name_test",
      "postgresql://u:secret-pass@localhost:5433/x_test",
    ];
    for (const url of attempts) {
      try {
        assertSafeTestDatabaseUrl(url, [url]);
      } catch (error) {
        expect((error as Error).message).not.toContain("secret-pass");
      }
    }
  });
});
