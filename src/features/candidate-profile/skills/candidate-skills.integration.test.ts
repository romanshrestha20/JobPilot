import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSafeTestDatabaseUrl } from "@/test/database-guard";
import { type TestDatabase, connectTestDatabase, createTestUser } from "@/test/integration-db";
import { candidateSkill } from "../schema";
import { createSkillRepository } from "./repository";
import { createSkillService } from "./service";
import { SKILL_LIMITS } from "./validation";

let db: TestDatabase;
let close: () => Promise<void>;
let service: ReturnType<typeof createSkillService>;
// `connectTestDatabase` uses a single connection, which would run "simultaneous" requests one
// after another. The race tests use a pool of their own so the requests really overlap.
let raceService: ReturnType<typeof createSkillService>;
let closeRacePool: () => Promise<void>;
let alice: { id: string };
let bob: { id: string };
const createdUsers: string[] = [];

const skill = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  level: null,
  yearsOfExperience: null,
  evidence: null,
  ...extra,
});

async function skillRows(userId: string) {
  return db.select().from(candidateSkill).where(eq(candidateSkill.userId, userId));
}

async function newUser(label: string) {
  const created = await createTestUser(db, label);
  createdUsers.push(created.id);
  return created;
}

beforeAll(async () => {
  ({ db, close } = await connectTestDatabase());
  service = createSkillService(createSkillRepository(db));
  const url = assertSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL, [process.env.DATABASE_URL]);
  const racePool = postgres(url, { max: 12, onnotice: () => {} });
  raceService = createSkillService(createSkillRepository(drizzle(racePool)));
  closeRacePool = () => racePool.end();
  alice = await newUser("alice");
  bob = await newUser("bob");
});

afterAll(async () => {
  // Deleting users cascades to their skills.
  for (const id of createdUsers) await db.execute(sql`delete from "user" where id = ${id}`);
  await closeRacePool();
  await close();
});

describe("add, list, edit and remove (real PostgreSQL)", () => {
  let id: string;

  it("starts empty", async () => {
    await expect(service.listMySkills(alice)).resolves.toEqual([]);
  });

  it("adds a skill owned by the authenticated user, with a canonical key", async () => {
    const result = await service.addMySkill(
      alice,
      skill("  Type   Script ", { level: "advanced", yearsOfExperience: 4, evidence: "API work" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    id = result.skill.id;
    expect(result.skill).not.toHaveProperty("userId");
    const rows = await skillRows(alice.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: alice.id,
      skillKey: "type script",
      displayName: "Type Script",
      level: "advanced",
      yearsOfExperience: 4,
      evidence: "API work",
    });
  });

  it("lists it, sorted by name without regard to case", async () => {
    await service.addMySkill(alice, skill("docker"));
    await service.addMySkill(alice, skill("Angular"));

    const names = (await service.listMySkills(alice)).map((s) => s.name);

    expect(names).toEqual(["Angular", "docker", "Type Script"]);
  });

  it("edits all four fields, keeps the row and moves updated_at forward", async () => {
    const before = (await skillRows(alice.id)).find((row) => row.id === id)!;
    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await service.updateMySkill(
      alice,
      id,
      skill("TypeScript", { level: "expert", yearsOfExperience: 6, evidence: null }),
    );

    expect(result.ok).toBe(true);
    const after = (await skillRows(alice.id)).find((row) => row.id === id)!;
    expect(after).toMatchObject({
      skillKey: "typescript",
      displayName: "TypeScript",
      level: "expert",
      yearsOfExperience: 6,
      evidence: null,
    });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it("allows re-saving a skill under its own key (case change, same row)", async () => {
    const result = await service.updateMySkill(alice, id, skill("TYPESCRIPT"));

    expect(result.ok).toBe(true);
    expect((await skillRows(alice.id)).filter((row) => row.skillKey === "typescript")).toHaveLength(
      1,
    );
  });

  it("removes it", async () => {
    await expect(service.removeMySkill(alice, id)).resolves.toBe(true);
    await expect(service.removeMySkill(alice, id)).resolves.toBe(false);
    expect((await skillRows(alice.id)).map((row) => row.displayName).sort()).toEqual([
      "Angular",
      "docker",
    ]);
  });
});

describe("duplicate canonical skills", () => {
  it("rejects the same skill in another casing or spacing, on add and on edit", async () => {
    const carol = await newUser("carol");
    await service.addMySkill(carol, skill("TypeScript"));
    const other = await service.addMySkill(carol, skill("Rust"));

    await expect(service.addMySkill(carol, skill("typescript"))).resolves.toEqual({
      ok: false,
      reason: "duplicate",
    });
    await expect(service.addMySkill(carol, skill(" TYPESCRIPT "))).resolves.toEqual({
      ok: false,
      reason: "duplicate",
    });
    if (!other.ok) throw new Error("setup failed");
    await expect(
      service.updateMySkill(carol, other.skill.id, skill("typescript")),
    ).resolves.toEqual({ ok: false, reason: "duplicate" });
    expect((await skillRows(carol.id)).map((row) => row.displayName).sort()).toEqual([
      "Rust",
      "TypeScript",
    ]);
  });

  it("lets two users hold the same skill", async () => {
    const dave = await newUser("dave");
    const erin = await newUser("erin");

    expect((await service.addMySkill(dave, skill("Go"))).ok).toBe(true);
    expect((await service.addMySkill(erin, skill("Go"))).ok).toBe(true);
  });

  it("allows at most one of many simultaneous identical adds", async () => {
    const frank = await newUser("frank");

    const results = await Promise.all(
      Array.from({ length: 8 }, () => raceService.addMySkill(frank, skill("Kotlin"))),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.reason === "duplicate")).toHaveLength(7);
    expect(await skillRows(frank.id)).toHaveLength(1);
  });

  it("is enforced by the database too (UNIQUE user_id + skill_key)", async () => {
    const gina = await newUser("gina");
    await db
      .insert(candidateSkill)
      .values({ userId: gina.id, skillKey: "sql", displayName: "SQL" });

    await expect(
      db.insert(candidateSkill).values({ userId: gina.id, skillKey: "sql", displayName: "sql" }),
    ).rejects.toThrow();
  });
});

describe("the 50-skill limit", () => {
  it("accepts the 50th skill and rejects the 51st", async () => {
    const henry = await newUser("henry");
    for (let i = 1; i <= SKILL_LIMITS.maxSkills; i++) {
      const result = await service.addMySkill(henry, skill(`Skill ${i}`));
      expect(result.ok, `skill ${i}`).toBe(true);
    }

    await expect(service.addMySkill(henry, skill("One too many"))).resolves.toEqual({
      ok: false,
      reason: "limit_reached",
    });
    expect(await skillRows(henry.id)).toHaveLength(SKILL_LIMITS.maxSkills);
    expect(await service.listMySkills(henry)).toHaveLength(SKILL_LIMITS.maxSkills);
  });

  it("frees a slot when a skill is removed, and does not count other users' skills", async () => {
    const henry = (
      await db.select().from(candidateSkill).where(eq(candidateSkill.skillKey, "skill 1"))
    )[0];
    await service.removeMySkill({ id: henry.userId }, henry.id);
    expect((await service.addMySkill({ id: henry.userId }, skill("Replacement"))).ok).toBe(true);

    // Alice holds a couple of skills; her count is her own.
    expect((await service.addMySkill(alice, skill("Vue"))).ok).toBe(true);
  });

  it("holds under simultaneous adds: never more than 50 rows", async () => {
    const iris = await newUser("iris");
    for (let i = 1; i <= SKILL_LIMITS.maxSkills - 2; i++) {
      await service.addMySkill(iris, skill(`Base ${i}`));
    }

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => raceService.addMySkill(iris, skill(`Race ${i}`))),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.filter((r) => !r.ok && r.reason === "limit_reached")).toHaveLength(8);
    expect(await skillRows(iris.id)).toHaveLength(SKILL_LIMITS.maxSkills);
  });

  it("does not block editing at the limit", async () => {
    const [row] = await db
      .select()
      .from(candidateSkill)
      .where(eq(candidateSkill.skillKey, "base 1"));
    const result = await service.updateMySkill(
      { id: row.userId },
      row.id,
      skill("Base 1", { level: "beginner" }),
    );

    expect(result.ok).toBe(true);
  });
});

describe("cross-user access denial", () => {
  it("another user sees none of Alice's skills", async () => {
    await expect(service.listMySkills(bob)).resolves.toEqual([]);
  });

  it("another user cannot edit or remove Alice's skill, and nothing changes", async () => {
    const [target] = await skillRows(alice.id);
    const before = (await skillRows(alice.id)).map((row) => ({ ...row }));

    const edit = await service.updateMySkill(bob, target.id, skill("Hijacked"));
    const remove = await service.removeMySkill(bob, target.id);

    expect(edit).toEqual({ ok: false, reason: "not_found" });
    expect(remove).toBe(false);
    expect(await skillRows(alice.id)).toEqual(before);
    expect(await skillRows(bob.id)).toHaveLength(0);
  });

  it("a foreign edit does not trip over Bob's own duplicate check", async () => {
    const [target] = await skillRows(alice.id);
    await service.addMySkill(bob, skill(target.displayName));

    const edit = await service.updateMySkill(bob, target.id, skill(target.displayName));

    // Bob's own same-named skill is a duplicate for him; Alice's row is still unreachable.
    expect(edit.ok).toBe(false);
    expect((await skillRows(alice.id)).find((row) => row.id === target.id)).toBeDefined();
  });

  it("rejects an attempt to set userId, id or skillKey, and changes nothing", async () => {
    const aliceBefore = await skillRows(alice.id);
    const bobBefore = await skillRows(bob.id);

    for (const forged of [{ userId: alice.id }, { id: aliceBefore[0].id }, { skillKey: "x" }]) {
      expect(await service.addMySkill(bob, skill("Forged", forged))).toMatchObject({
        ok: false,
        reason: "invalid",
      });
    }

    expect(await skillRows(alice.id)).toEqual(aliceBefore);
    expect(await skillRows(bob.id)).toEqual(bobBefore);
  });

  it("exposes no repository method that reads or writes a skill without its owner", () => {
    expect(Object.keys(createSkillRepository(db)).sort()).toEqual([
      "create",
      "delete",
      "listByUserId",
      "update",
    ]);
  });
});

describe("database constraints", () => {
  const base = (userId: string) => ({ userId, skillKey: "k", displayName: "K" });

  it("requires an existing user (foreign key)", async () => {
    await expect(db.insert(candidateSkill).values(base("no-such-user"))).rejects.toThrow();
  });

  it("rejects bad levels, years, blank or over-long text", async () => {
    const jane = await newUser("jane");
    const bad = [
      { level: "guru" },
      { level: "Expert" },
      { yearsOfExperience: 61 },
      { yearsOfExperience: -1 },
      { skillKey: "" },
      { skillKey: " padded " },
      { skillKey: "k".repeat(81) },
      { displayName: "" },
      { displayName: "  " },
      { displayName: "d".repeat(81) },
      { evidence: "" },
      { evidence: "   " },
      { evidence: "e".repeat(501) },
    ];
    for (const override of bad) {
      await expect(
        db.insert(candidateSkill).values({ ...base(jane.id), ...override }),
        JSON.stringify(override).slice(0, 60),
      ).rejects.toThrow();
    }
    expect(await skillRows(jane.id)).toHaveLength(0);
  });

  it("accepts the boundary values", async () => {
    const kim = await newUser("kim");
    await expect(
      db.insert(candidateSkill).values({
        userId: kim.id,
        skillKey: "k".repeat(80),
        displayName: "D".repeat(80),
        level: "beginner",
        yearsOfExperience: 60,
        evidence: "e".repeat(500),
      }),
    ).resolves.toBeDefined();
  });

  it("stores timezone-aware timestamps", async () => {
    const rows = await db.execute<{ data_type: string }>(sql`
      select data_type from information_schema.columns
      where table_name = 'candidate_skill' and column_name in ('created_at', 'updated_at')`);
    expect([...rows].map((r) => r.data_type)).toEqual([
      "timestamp with time zone",
      "timestamp with time zone",
    ]);
  });

  it("deletes the skills when their user is deleted (cascade)", async () => {
    const leo = await newUser("leo");
    await service.addMySkill(leo, skill("Temp"));
    expect(await skillRows(leo.id)).toHaveLength(1);

    await db.execute(sql`delete from "user" where id = ${leo.id}`);

    expect(await skillRows(leo.id)).toHaveLength(0);
  });
});
