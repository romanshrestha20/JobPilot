import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import { createProfileRepository } from "./repository";
import { candidateProfile } from "./schema";
import { createProfileService } from "./service";

let db: TestDatabase;
let close: () => Promise<void>;
let service: ReturnType<typeof createProfileService>;
let alice: { id: string };
let bob: { id: string };
const createdUsers: string[] = [];

async function profileRows(userId: string) {
  return db.select().from(candidateProfile).where(eq(candidateProfile.userId, userId));
}

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
  service = createProfileService(createProfileRepository(db));
  alice = await createTestUser(db, "alice");
  bob = await createTestUser(db, "bob");
  createdUsers.push(alice.id, bob.id);
});

afterAll(async () => {
  // Deleting users cascades to their profiles.
  for (const id of createdUsers) await db.execute(sql`delete from "user" where id = ${id}`);
  await close();
});

describe("profile read/create/update (real PostgreSQL)", () => {
  it("returns null before a profile exists", async () => {
    await expect(service.getMyProfile(alice)).resolves.toBeNull();
  });

  it("creates a profile owned by the authenticated user", async () => {
    const result = await service.updateMyProfile(alice, {
      headline: "Backend engineer",
      location: "Kathmandu",
      yearsOfExperience: 5,
      languages: ["English", "Nepali", "English"],
      workModes: ["remote", "hybrid"],
    });

    expect(result.ok).toBe(true);
    const rows = await profileRows(alice.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: alice.id,
      headline: "Backend engineer",
      yearsOfExperience: 5,
      languages: ["English", "Nepali"],
      workModes: ["remote", "hybrid"],
    });
  });

  it("reads it back without exposing id or userId", async () => {
    const profile = await service.getMyProfile(alice);

    expect(profile).toMatchObject({ headline: "Backend engineer", location: "Kathmandu" });
    expect(profile).not.toHaveProperty("userId");
    expect(profile).not.toHaveProperty("id");
  });

  it("updates only the provided fields and keeps a single row", async () => {
    const before = (await profileRows(alice.id))[0];
    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await service.updateMyProfile(alice, { headline: "Senior backend engineer" });

    expect(result.ok).toBe(true);
    const rows = await profileRows(alice.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: before.id,
      headline: "Senior backend engineer",
      location: "Kathmandu",
      yearsOfExperience: 5,
    });
    expect(rows[0].updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(rows[0].createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it("can clear a nullable field", async () => {
    await service.updateMyProfile(alice, { location: "" });

    expect((await profileRows(alice.id))[0].location).toBeNull();
  });
});

describe("cross-user access denial", () => {
  it("another user sees no profile, not Alice's", async () => {
    await expect(service.getMyProfile(bob)).resolves.toBeNull();
  });

  it("another user's update writes only to their own row and leaves Alice's untouched", async () => {
    const aliceBefore = (await profileRows(alice.id))[0];

    const result = await service.updateMyProfile(bob, { headline: "Bob's headline" });

    expect(result.ok).toBe(true);
    expect((await profileRows(alice.id))[0]).toEqual(aliceBefore);
    expect((await profileRows(bob.id))[0]).toMatchObject({
      userId: bob.id,
      headline: "Bob's headline",
    });
    expect(await service.getMyProfile(alice)).toMatchObject({
      headline: "Senior backend engineer",
    });
  });

  it("rejects an attempt to set userId or id, and changes nothing", async () => {
    const aliceBefore = (await profileRows(alice.id))[0];
    const bobBefore = (await profileRows(bob.id))[0];

    const hijackUserId = await service.updateMyProfile(bob, {
      userId: alice.id,
      headline: "pwned",
    });
    const hijackId = await service.updateMyProfile(bob, { id: aliceBefore.id, headline: "pwned" });

    expect(hijackUserId.ok).toBe(false);
    expect(hijackId.ok).toBe(false);
    expect((await profileRows(alice.id))[0]).toEqual(aliceBefore);
    expect((await profileRows(bob.id))[0]).toEqual(bobBefore);
  });

  it("exposes no repository method that loads a profile by its own id", () => {
    expect(Object.keys(createProfileRepository(db)).sort()).toEqual([
      "findByUserId",
      "upsertForUser",
    ]);
  });
});

describe("database constraints", () => {
  it("enforces one profile per user", async () => {
    await expect(db.insert(candidateProfile).values({ userId: alice.id })).rejects.toThrow();
    expect(await profileRows(alice.id)).toHaveLength(1);
  });

  it("requires an existing user (foreign key)", async () => {
    await expect(db.insert(candidateProfile).values({ userId: "no-such-user" })).rejects.toThrow();
  });

  it("rejects out-of-range experience and unknown work modes", async () => {
    const carol = await createTestUser(db, "carol");
    createdUsers.push(carol.id);

    await expect(
      db.insert(candidateProfile).values({ userId: carol.id, yearsOfExperience: 99 }),
    ).rejects.toThrow();
    await expect(
      db.insert(candidateProfile).values({ userId: carol.id, workModes: ["teleport"] }),
    ).rejects.toThrow();
    expect(await profileRows(carol.id)).toHaveLength(0);
  });

  it("deletes the profile when its user is deleted (cascade)", async () => {
    const dave = await createTestUser(db, "dave");
    createdUsers.push(dave.id);
    await service.updateMyProfile(dave, { headline: "Temp" });
    expect(await profileRows(dave.id)).toHaveLength(1);

    await db.execute(sql`delete from "user" where id = ${dave.id}`);

    expect(await profileRows(dave.id)).toHaveLength(0);
  });
});
