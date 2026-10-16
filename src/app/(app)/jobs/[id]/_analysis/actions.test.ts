import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
const requestAnalysis = vi.fn();
const revalidatePath = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/identity/server", () => ({ requireUser }));
vi.mock("./server", () => ({ getAnalysisService: () => ({ requestAnalysis }) }));

const { requestAnalysisAction } = await import("./actions");

const JOB = "11111111-1111-4111-8111-111111111111";
const idle = { status: "idle" } as const;
const form = (entries: [string, string][]) => {
  const data = new FormData();
  for (const [key, value] of entries) data.append(key, value);
  return data;
};

beforeEach(() => {
  for (const mock of [requireUser, requestAnalysis, revalidatePath, notFound]) mock.mockReset();
  notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

describe("requestAnalysisAction", () => {
  it("rejects a signed-out request before touching the service", async () => {
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/sign-in"));
    await expect(requestAnalysisAction(idle, form([["jobId", JOB]]))).rejects.toThrow("/sign-in");
    expect(requestAnalysis).not.toHaveBeenCalled();
  });

  it("uses the session user as owner and ignores any user id in the form", async () => {
    requireUser.mockResolvedValue({ id: "user-alice" });
    requestAnalysis.mockResolvedValue({ ok: true, created: true, analysis: { jobId: JOB } });
    const result = await requestAnalysisAction(
      idle,
      form([
        ["jobId", JOB],
        ["userId", "user-bob"],
      ]),
    );
    expect(requestAnalysis).toHaveBeenCalledWith({ id: "user-alice" }, JOB);
    expect(result).toEqual({ status: "idle" });
    expect(revalidatePath).toHaveBeenCalledWith(`/jobs/${JOB}`);
  });

  it("passes a missing job id on as an empty string for the service to refuse", async () => {
    requireUser.mockResolvedValue({ id: "user-alice" });
    requestAnalysis.mockResolvedValue({ ok: false, reason: "not_found" });
    await expect(requestAnalysisAction(idle, form([]))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requestAnalysis).toHaveBeenCalledWith({ id: "user-alice" }, "");
  });

  it("a job that is missing or someone else's is a plain 404", async () => {
    requireUser.mockResolvedValue({ id: "user-alice" });
    requestAnalysis.mockResolvedValue({ ok: false, reason: "not_found" });
    await expect(requestAnalysisAction(idle, form([["jobId", JOB]]))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports the daily limit without starting anything", async () => {
    requireUser.mockResolvedValue({ id: "user-alice" });
    requestAnalysis.mockResolvedValue({ ok: false, reason: "quota_exceeded", limit: 20 });
    const result = await requestAnalysisAction(idle, form([["jobId", JOB]]));
    expect(result).toMatchObject({ status: "error", message: expect.stringContaining("20") });
  });

  it("shows a failed enqueue as an error and refreshes the page to the failed run", async () => {
    requireUser.mockResolvedValue({ id: "user-alice" });
    requestAnalysis.mockResolvedValue({ ok: false, reason: "enqueue_failed" });
    const result = await requestAnalysisAction(idle, form([["jobId", JOB]]));
    expect(result.status).toBe("error");
    expect(revalidatePath).toHaveBeenCalledWith(`/jobs/${JOB}`);
  });
});
