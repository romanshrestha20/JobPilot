import { describe, expect, it, vi } from "vitest";
import type { CandidateProfileRecord, ProfileRepository } from "./repository";
import { createProfileService } from "./service";

const record = (overrides: Partial<CandidateProfileRecord> = {}): CandidateProfileRecord => ({
  id: "profile-1",
  userId: "user-alice",
  headline: "Engineer",
  summary: null,
  location: null,
  yearsOfExperience: 3,
  languages: ["English"],
  workModes: ["remote"],
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
  ...overrides,
});

function fakeRepository(stored: CandidateProfileRecord | null = record()) {
  return {
    findByUserId: vi.fn(async () => stored),
    upsertForUser: vi.fn(async (userId: string, data: object) => record({ userId, ...data })),
  } satisfies ProfileRepository;
}

describe("profile service", () => {
  it("looks the profile up by the authenticated user's id only", async () => {
    const repo = fakeRepository();

    await createProfileService(repo).getMyProfile({ id: "user-alice" });

    expect(repo.findByUserId).toHaveBeenCalledExactlyOnceWith("user-alice");
  });

  it("returns null when the user has no profile", async () => {
    const service = createProfileService(fakeRepository(null));

    await expect(service.getMyProfile({ id: "user-bob" })).resolves.toBeNull();
  });

  it("never exposes id or userId in the DTO", async () => {
    const profile = await createProfileService(fakeRepository()).getMyProfile({ id: "user-alice" });

    expect(profile).not.toHaveProperty("id");
    expect(profile).not.toHaveProperty("userId");
    expect(profile).toMatchObject({ headline: "Engineer", yearsOfExperience: 3 });
  });

  it("writes under the authenticated user's id", async () => {
    const repo = fakeRepository();

    const result = await createProfileService(repo).updateMyProfile(
      { id: "user-alice" },
      { headline: "New" },
    );

    expect(result.ok).toBe(true);
    expect(repo.upsertForUser).toHaveBeenCalledExactlyOnceWith("user-alice", { headline: "New" });
  });

  it("rejects a client-supplied userId without touching the repository", async () => {
    const repo = fakeRepository();

    const result = await createProfileService(repo).updateMyProfile(
      { id: "user-bob" },
      { userId: "user-alice", headline: "pwned" },
    );

    expect(result.ok).toBe(false);
    expect(repo.upsertForUser).not.toHaveBeenCalled();
  });

  it("returns validation issues for bad input", async () => {
    const repo = fakeRepository();

    const result = await createProfileService(repo).updateMyProfile(
      { id: "user-alice" },
      { yearsOfExperience: 200 },
    );

    expect(result).toMatchObject({ ok: false });
    expect(repo.upsertForUser).not.toHaveBeenCalled();
  });
});
