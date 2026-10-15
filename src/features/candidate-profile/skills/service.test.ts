import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CandidateSkillRecord, SkillRepository } from "./repository";
import { createSkillService } from "./service";

const alice = { id: "user-alice" };
const SKILL_ID = "3f0c2d1e-5b8a-4c7e-9a41-0d6f2b7e8c19";

function record(overrides: Partial<CandidateSkillRecord> = {}): CandidateSkillRecord {
  return {
    id: SKILL_ID,
    userId: alice.id,
    skillKey: "typescript",
    displayName: "TypeScript",
    level: "advanced",
    yearsOfExperience: 4,
    evidence: "Shipped a typed API.",
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
    ...overrides,
  };
}

const repository = {
  listByUserId: vi.fn<SkillRepository["listByUserId"]>(),
  create: vi.fn<SkillRepository["create"]>(),
  update: vi.fn<SkillRepository["update"]>(),
  delete: vi.fn<SkillRepository["delete"]>(),
};

const service = createSkillService(repository);
const input = { name: "TypeScript", level: "advanced", yearsOfExperience: 4, evidence: null };

beforeEach(() => {
  for (const fn of Object.values(repository)) fn.mockReset();
});

describe("listMySkills", () => {
  it("lists only the caller's skills and omits the owner", async () => {
    repository.listByUserId.mockResolvedValue([record()]);

    const skills = await service.listMySkills(alice);

    expect(repository.listByUserId).toHaveBeenCalledWith(alice.id);
    expect(skills).toEqual([
      {
        id: SKILL_ID,
        name: "TypeScript",
        level: "advanced",
        yearsOfExperience: 4,
        evidence: "Shipped a typed API.",
        updatedAt: new Date("2026-01-02"),
      },
    ]);
    expect(skills[0]).not.toHaveProperty("userId");
    expect(skills[0]).not.toHaveProperty("skillKey");
  });
});

describe("addMySkill", () => {
  it("creates for the session user with a server-derived key", async () => {
    repository.create.mockResolvedValue({ ok: true, skill: record() });

    const result = await service.addMySkill(alice, { ...input, name: "  TYPE Script " });

    expect(result.ok).toBe(true);
    expect(repository.create).toHaveBeenCalledWith(
      alice.id,
      expect.objectContaining({ name: "TYPE Script", skillKey: "type script" }),
    );
  });

  it("rejects invalid input before touching the repository", async () => {
    const result = await service.addMySkill(alice, { ...input, yearsOfExperience: 99 });

    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("rejects an attempt to set the owner or the key", async () => {
    for (const forged of [{ userId: "user-bob" }, { skillKey: "x" }, { id: SKILL_ID }]) {
      const result = await service.addMySkill(alice, { ...input, ...forged });
      expect(result).toMatchObject({ ok: false, reason: "invalid" });
    }
    expect(repository.create).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "limit_reached"] as const)("passes through %s", async (reason) => {
    repository.create.mockResolvedValue({ ok: false, reason });

    await expect(service.addMySkill(alice, input)).resolves.toEqual({ ok: false, reason });
  });
});

describe("updateMySkill", () => {
  it("updates through the repository with the session user and id", async () => {
    repository.update.mockResolvedValue({ ok: true, skill: record({ level: "expert" }) });

    const result = await service.updateMySkill(alice, SKILL_ID, { ...input, level: "expert" });

    expect(result).toMatchObject({ ok: true, skill: { level: "expert" } });
    expect(repository.update).toHaveBeenCalledWith(alice.id, SKILL_ID, expect.anything());
  });

  it("treats a malformed id as not found without a database call", async () => {
    await expect(service.updateMySkill(alice, "nope", input)).resolves.toEqual({
      ok: false,
      reason: "not_found",
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("validates input", async () => {
    const result = await service.updateMySkill(alice, SKILL_ID, { ...input, name: "" });

    expect(result).toMatchObject({ ok: false, reason: "invalid" });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "not_found"] as const)("passes through %s", async (reason) => {
    repository.update.mockResolvedValue({ ok: false, reason });

    await expect(service.updateMySkill(alice, SKILL_ID, input)).resolves.toEqual({
      ok: false,
      reason,
    });
  });
});

describe("removeMySkill", () => {
  it("deletes with the session user", async () => {
    repository.delete.mockResolvedValue(true);

    await expect(service.removeMySkill(alice, SKILL_ID)).resolves.toBe(true);
    expect(repository.delete).toHaveBeenCalledWith(alice.id, SKILL_ID);
  });

  it("reports false for a malformed id without a database call", async () => {
    await expect(service.removeMySkill(alice, "../..")).resolves.toBe(false);
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
