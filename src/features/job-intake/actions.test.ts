import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const createMyJob = vi.fn();
const deleteMyJob = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect, notFound }));
vi.mock("@/features/identity/server", () => ({ requireUser }));
vi.mock("./index", () => ({ createMyJob, deleteMyJob }));

const { createJobAction, deleteJobAction } = await import("./actions");
const { EMPTY_JOB_FORM } = await import("./form");

const idle = { status: "idle", values: EMPTY_JOB_FORM } as const;
const ID = "11111111-1111-4111-8111-111111111111";

function form(entries: [string, string][]) {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
}

beforeEach(() => {
  for (const mock of [requireUser, createMyJob, deleteMyJob, redirect, notFound]) mock.mockClear();
  requireUser.mockReset();
});

describe("createJobAction", () => {
  it("rejects unauthenticated requests before any job operation", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));
    await expect(createJobAction(idle, form([["title", "x"]]))).rejects.toThrow("/sign-in");
    expect(createMyJob).not.toHaveBeenCalled();
  });

  it("creates for the session user, forwards named fields only, then redirects", async () => {
    const user = { id: "user-alice" };
    requireUser.mockResolvedValue(user);
    createMyJob.mockResolvedValue({ ok: true, job: { id: ID } });

    await expect(
      createJobAction(
        idle,
        form([
          ["title", "Engineer"],
          ["company", "Acme"],
          ["description", "Do things."],
          ["userId", "user-bob"],
          ["id", "forged"],
        ]),
      ),
    ).rejects.toThrow(`NEXT_REDIRECT:/jobs/${ID}?saved=1`);

    const [owner, values] = createMyJob.mock.calls[0];
    expect(owner).toBe(user);
    expect(Object.keys(values).sort()).toEqual([
      "company",
      "description",
      "location",
      "sourceUrl",
      "title",
    ]);
  });

  it("returns field errors and the entered values when validation fails", async () => {
    requireUser.mockResolvedValue({ id: "user-alice" });
    createMyJob.mockResolvedValue({
      ok: false,
      errors: [{ path: ["title"], message: "Title is required." }],
    });

    const state = await createJobAction(idle, form([["description", "kept"]]));

    expect(state).toMatchObject({
      status: "error",
      fieldErrors: { title: "Title is required." },
      values: { description: "kept" },
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("deleteJobAction", () => {
  it("requires authentication", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));
    await expect(deleteJobAction(form([["id", ID]]))).rejects.toThrow("/sign-in");
    expect(deleteMyJob).not.toHaveBeenCalled();
  });

  it("deletes for the session user and redirects to the list", async () => {
    const user = { id: "user-alice" };
    requireUser.mockResolvedValue(user);
    deleteMyJob.mockResolvedValue(true);

    await expect(deleteJobAction(form([["id", ID]]))).rejects.toThrow(
      "NEXT_REDIRECT:/jobs?deleted=1",
    );
    expect(deleteMyJob).toHaveBeenCalledWith(user, ID);
  });

  it("responds 404 when the job is missing or not owned", async () => {
    requireUser.mockResolvedValue({ id: "user-alice" });
    deleteMyJob.mockResolvedValue(false);

    await expect(deleteJobAction(form([["id", ID]]))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
