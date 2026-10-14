import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const updateMyProfile = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/features/identity/server", () => ({ requireUser }));
vi.mock("./index", () => ({ updateMyProfile }));

const { saveProfileAction } = await import("./actions");
const { EMPTY_FORM_VALUES } = await import("./form");

const idle = { status: "idle", values: EMPTY_FORM_VALUES } as const;

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

beforeEach(() => {
  requireUser.mockReset();
  updateMyProfile.mockReset();
});

describe("saveProfileAction", () => {
  it("rejects unauthenticated requests before any profile operation", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));

    await expect(saveProfileAction(idle, form([["headline", "x"]]))).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(updateMyProfile).not.toHaveBeenCalled();
  });

  it("saves for the session user and ignores a forged userId field", async () => {
    const user = { id: "user-alice" };
    requireUser.mockResolvedValue(user);
    updateMyProfile.mockResolvedValue({
      ok: true,
      profile: {
        headline: "Dev",
        summary: null,
        location: null,
        yearsOfExperience: null,
        languages: [],
        workModes: [],
        updatedAt: new Date(),
      },
    });

    const state = await saveProfileAction(
      idle,
      form([
        ["userId", "user-bob"],
        ["headline", "Dev"],
      ]),
    );

    expect(state.status).toBe("success");
    const [passedUser, passedInput] = updateMyProfile.mock.calls[0];
    expect(passedUser).toBe(user);
    expect(passedInput).not.toHaveProperty("userId");
  });

  it("returns field errors and echoes the submitted values on invalid input", async () => {
    requireUser.mockResolvedValue({ id: "user-alice" });
    updateMyProfile.mockResolvedValue({
      ok: false,
      errors: [{ code: "too_big", path: ["yearsOfExperience"], message: "Too big" }],
    });

    const state = await saveProfileAction(idle, form([["yearsOfExperience", "200"]]));

    expect(state).toMatchObject({
      status: "error",
      fieldErrors: { yearsOfExperience: "Too big" },
      values: { yearsOfExperience: "200" },
    });
  });
});
