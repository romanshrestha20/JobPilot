import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const addMySkill = vi.fn();
const updateMySkill = vi.fn();
const removeMySkill = vi.fn();
const revalidatePath = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/identity/server", () => ({ requireUser }));
vi.mock("../index", () => ({ addMySkill, updateMySkill, removeMySkill }));

const { addSkillAction, updateSkillAction, deleteSkillAction } = await import("./actions");
const { EMPTY_SKILL_FORM_VALUES } = await import("./form");

const idle = { status: "idle", values: EMPTY_SKILL_FORM_VALUES } as const;
const alice = { id: "user-alice" };
const dto = {
  id: "3f0c2d1e-5b8a-4c7e-9a41-0d6f2b7e8c19",
  name: "Go",
  level: null,
  yearsOfExperience: null,
  evidence: null,
  updatedAt: new Date(),
};

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

beforeEach(() => {
  for (const fn of [requireUser, addMySkill, updateMySkill, removeMySkill, revalidatePath]) {
    fn.mockReset();
  }
  requireUser.mockResolvedValue(alice);
});

describe("authentication", () => {
  it("rejects signed-out requests before any skill operation", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));

    await expect(addSkillAction(idle, form([["name", "Go"]]))).rejects.toThrow("NEXT_REDIRECT");
    await expect(updateSkillAction(idle, form([["name", "Go"]]))).rejects.toThrow("NEXT_REDIRECT");
    await expect(deleteSkillAction(form([["id", dto.id]]))).rejects.toThrow("NEXT_REDIRECT");
    expect(addMySkill).not.toHaveBeenCalled();
    expect(updateMySkill).not.toHaveBeenCalled();
    expect(removeMySkill).not.toHaveBeenCalled();
  });
});

describe("addSkillAction", () => {
  it("adds for the session user, ignores a forged userId and resets the form", async () => {
    addMySkill.mockResolvedValue({ ok: true, skill: dto });

    const state = await addSkillAction(
      idle,
      form([
        ["userId", "user-bob"],
        ["name", "Go"],
      ]),
    );

    expect(state).toMatchObject({ status: "success", values: EMPTY_SKILL_FORM_VALUES });
    const [passedUser, passedInput] = addMySkill.mock.calls[0];
    expect(passedUser).toBe(alice);
    expect(passedInput).not.toHaveProperty("userId");
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("returns field errors and echoes the submitted values", async () => {
    addMySkill.mockResolvedValue({
      ok: false,
      reason: "invalid",
      errors: [{ code: "too_big", path: ["yearsOfExperience"], message: "Too big" }],
    });

    const state = await addSkillAction(
      idle,
      form([
        ["name", "Go"],
        ["yearsOfExperience", "99"],
      ]),
    );

    expect(state).toMatchObject({
      status: "error",
      fieldErrors: { yearsOfExperience: "Too big" },
      values: { name: "Go", yearsOfExperience: "99" },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a duplicate on the name field", async () => {
    addMySkill.mockResolvedValue({ ok: false, reason: "duplicate" });

    const state = await addSkillAction(idle, form([["name", "Go"]]));

    expect(state).toMatchObject({
      status: "error",
      fieldErrors: { name: expect.stringMatching(/already have/i) },
    });
  });

  it("reports the limit as a form-level error", async () => {
    addMySkill.mockResolvedValue({ ok: false, reason: "limit_reached" });

    const state = await addSkillAction(idle, form([["name", "Go"]]));

    expect(state).toMatchObject({ status: "error", formError: expect.stringMatching(/50 skills/) });
  });
});

describe("updateSkillAction", () => {
  it("updates the skill named by the form id for the session user", async () => {
    updateMySkill.mockResolvedValue({ ok: true, skill: dto });

    const state = await updateSkillAction(
      idle,
      form([
        ["id", dto.id],
        ["name", "Go"],
      ]),
    );

    expect(state.status).toBe("success");
    expect(updateMySkill).toHaveBeenCalledWith(
      alice,
      dto.id,
      expect.objectContaining({ name: "Go" }),
    );
  });

  it("does not leak whether a missing or foreign skill exists", async () => {
    updateMySkill.mockResolvedValue({ ok: false, reason: "not_found" });

    const state = await updateSkillAction(
      idle,
      form([
        ["id", dto.id],
        ["name", "Go"],
      ]),
    );

    expect(state).toMatchObject({
      status: "error",
      formError: expect.stringMatching(/no longer exists/),
    });
  });

  it("passes an absent id through as an empty string", async () => {
    updateMySkill.mockResolvedValue({ ok: false, reason: "not_found" });

    await updateSkillAction(idle, form([["name", "Go"]]));

    expect(updateMySkill).toHaveBeenCalledWith(alice, "", expect.anything());
  });
});

describe("deleteSkillAction", () => {
  it("removes for the session user and refreshes the page", async () => {
    removeMySkill.mockResolvedValue(true);

    await deleteSkillAction(form([["id", dto.id]]));

    expect(removeMySkill).toHaveBeenCalledWith(alice, dto.id);
    expect(revalidatePath).toHaveBeenCalledWith("/profile");
  });

  it("is a quiet no-op for a skill that is not the caller's", async () => {
    removeMySkill.mockResolvedValue(false);

    await expect(deleteSkillAction(form([["id", dto.id]]))).resolves.toBeUndefined();
  });
});
