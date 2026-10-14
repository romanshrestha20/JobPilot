import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));

const { NotFoundError, UnauthenticatedError, assertOwned, getSessionUser, requireUserFromHeaders } =
  await import("@/lib/authz");

const alice = { id: "user-alice" };
const bob = { id: "user-bob" };

beforeEach(() => {
  getSession.mockReset();
});

describe("session validation", () => {
  it("returns the user and forwards request headers to Better Auth", async () => {
    getSession.mockResolvedValue({ user: alice, session: {} });
    const headers = new Headers({ cookie: "better-auth.session_token=abc" });

    await expect(requireUserFromHeaders(headers)).resolves.toBe(alice);
    expect(getSession).toHaveBeenCalledWith({ headers });
  });

  it("throws UnauthenticatedError when there is no valid session", async () => {
    getSession.mockResolvedValue(null);

    await expect(getSessionUser(new Headers())).resolves.toBeNull();
    await expect(requireUserFromHeaders(new Headers())).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it("does not swallow Better Auth failures as 'signed out'", async () => {
    getSession.mockRejectedValue(new Error("db down"));

    await expect(requireUserFromHeaders(new Headers())).rejects.toThrow("db down");
  });
});

describe("assertOwned", () => {
  const record = { id: "rec-1", userId: alice.id };

  it("returns the record for its owner", () => {
    expect(assertOwned(record, alice)).toBe(record);
  });

  it("throws NotFoundError for another user's record", () => {
    expect(() => assertOwned(record, bob)).toThrow(NotFoundError);
  });

  it("throws the same NotFoundError for a missing record, so existence is not leaked", () => {
    expect(() => assertOwned(undefined, alice)).toThrow(NotFoundError);
    expect(() => assertOwned(null, alice)).toThrow(NotFoundError);
  });
});
