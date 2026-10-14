import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));

const { withUser } = await import("@/lib/api-auth");
const { assertOwned } = await import("@/lib/authz");

const alice = { id: "user-alice", name: "Alice" };
const bob = { id: "user-bob", name: "Bob" };

// Stand-in for a private-record repository; real ones must scope by userId the same way.
const records = new Map([
  ["rec-1", { id: "rec-1", userId: alice.id, title: "Alice's private note" }],
]);

const getRecord = withUser<{ id: string }>(async (_request, user, { id }) => {
  const record = assertOwned(records.get(id), user);
  return Response.json(record);
});

function asUser(user: typeof alice | null) {
  getSession.mockResolvedValue(user ? { user, session: {} } : null);
}

const request = () => new Request("http://localhost/api/records/rec-1");

beforeEach(() => {
  getSession.mockReset();
});

describe("withUser", () => {
  it("returns 401 without running the handler when signed out", async () => {
    asUser(null);
    const handler = vi.fn();

    const response = await withUser(handler)(request(), undefined);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "UNAUTHENTICATED", message: "Authentication required" },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(handler).not.toHaveBeenCalled();
  });

  it("lets the owner read their record", async () => {
    asUser(alice);

    const response = await getRecord(request(), { id: "rec-1" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "rec-1", userId: alice.id });
  });

  it("returns 404 and no record data when another user requests it", async () => {
    asUser(bob);

    const response = await getRecord(request(), { id: "rec-1" });
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).not.toContain("private note");
  });

  it("returns an identical 404 for a record that does not exist", async () => {
    asUser(bob);

    const missing = await getRecord(request(), { id: "nope" });
    const foreign = await getRecord(request(), { id: "rec-1" });

    expect(missing.status).toBe(foreign.status);
    expect(await missing.json()).toEqual(await foreign.json());
  });

  it("rethrows unexpected errors instead of leaking details in a response", async () => {
    asUser(alice);
    const boom = withUser(async () => {
      throw new Error("SELECT * FROM secrets failed");
    });

    await expect(boom(request(), undefined)).rejects.toThrow("SELECT * FROM secrets failed");
  });
});
