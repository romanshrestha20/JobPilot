import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const headersMock = vi.fn();
const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("next/navigation", () => ({ redirect }));

const { requireUser } = await import("@/features/identity/server");

beforeEach(() => {
  getSession.mockReset();
  redirect.mockClear();
  headersMock.mockResolvedValue(new Headers());
});

describe("requireUser", () => {
  it("returns the signed-in user", async () => {
    const user = { id: "user-alice" };
    getSession.mockResolvedValue({ user, session: {} });

    await expect(requireUser()).resolves.toBe(user);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects to /sign-in when signed out", async () => {
    getSession.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/sign-in");
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("does not redirect on unexpected failures", async () => {
    getSession.mockRejectedValue(new Error("db down"));

    await expect(requireUser()).rejects.toThrow("db down");
    expect(redirect).not.toHaveBeenCalled();
  });
});
