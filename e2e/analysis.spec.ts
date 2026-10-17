import { expect, test } from "./fixtures";
import { seedAnalysis, signInViaApi } from "./support";

// Runs against the production build and the background worker (demo provider, guarded test
// database). The demo extractor is keyword based, so the description names its skills plainly.
const DESCRIPTION = [
  "Backend engineer",
  "",
  "Requirements:",
  "- 3 years of experience with TypeScript and PostgreSQL",
  "",
  "Nice to have:",
  "- Docker",
  "",
  "This is a remote role.",
].join("\n");

test.describe("job analysis", () => {
  // Each test waits for a real queue round trip.
  test.setTimeout(90_000);

  test("analyses a job: starts, shows progress, then the requirements with the demo label", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/new");
    await page.getByLabel("Job title").fill("Backend engineer");
    await page.getByLabel("Company").fill("Acme Oy");
    await page.getByLabel("Job description").fill(DESCRIPTION);
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\?saved=1$/);

    const panel = page.getByRole("region", { name: "Job requirements" });
    await expect(panel.getByText("Only the job text is sent to the AI")).toBeVisible();
    await panel.getByRole("button", { name: "Analyse job" }).click();

    // The result arrives by itself (polling), without a reload.
    await expect(panel.getByRole("heading", { name: "Required skills" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.getByText("TypeScript", { exact: true }).first()).toBeVisible();
    await expect(panel.getByText("PostgreSQL", { exact: true }).first()).toBeVisible();
    // The evidence quote is visible text, not a hover title.
    const evidence = panel.locator("summary", { hasText: "Show where each skill appears" });
    await expect(panel.locator("q").first()).toBeHidden(); // collapsed until asked for
    await evidence.click();
    await expect(panel.locator("q").first()).toBeVisible();
    await expect(panel.locator("[title]")).toHaveCount(0);
    await expect(panel.getByRole("heading", { name: "Preferred skills" })).toBeVisible();
    await expect(panel.getByText("Demo extraction (no AI model)")).toBeVisible();
    await expect(panel.getByText("Analysing the job description")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "Re-run analysis" })).toBeVisible();
  });

  test("editing the description marks the result out of date and offers a re-run", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/new");
    await page.getByLabel("Job title").fill("Platform engineer");
    await page.getByLabel("Company").fill("Acme Oy");
    await page.getByLabel("Job description").fill(DESCRIPTION);
    await page.getByRole("button", { name: "Save job" }).click();
    const panel = page.getByRole("region", { name: "Job requirements" });
    await panel.getByRole("button", { name: "Analyse job" }).click();
    await expect(panel.getByRole("heading", { name: "Required skills" })).toBeVisible({
      timeout: 30_000,
    });

    const detail = page.url().split("?")[0];
    await page.goto(`${detail}/edit`);
    await expect(page.getByRole("button", { name: "Save changes" })).toBeEnabled();
    await page.getByLabel("Job description").fill(`${DESCRIPTION}\n\nAlso: Kubernetes.`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\?updated=1$/);

    await expect(panel.getByText("Out of date")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Re-run analysis" })).toBeVisible();
    // The earlier result stays visible until a new one replaces it.
    await expect(panel.getByText("TypeScript", { exact: true }).first()).toBeVisible();
  });

  test("a job id that is not the user's shows the plain not-found page", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    // Streamed: the status is 200 either way, as for every job route (see jobs.spec.ts).
    await page.goto("/jobs/11111111-1111-4111-8111-111111111111");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Analyse job" })).toHaveCount(0);
  });

  async function addJob(page: import("@playwright/test").Page, title: string) {
    await page.goto("/jobs/new");
    await page.getByLabel("Job title").fill(title);
    await page.getByLabel("Company").fill("Acme Oy");
    await page.getByLabel("Job description").fill(DESCRIPTION);
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\?saved=1$/);
    return /\/jobs\/([0-9a-f-]{36})/.exec(page.url())![1];
  }

  test("shows a running analysis as progress, with no start button", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const jobId = await addJob(page, "Running job");
    await seedAnalysis(jobId, { status: "processing", attempts: 2 });
    await page.reload();

    const panel = page.getByRole("region", { name: "Job requirements" });
    await expect(panel.getByText("Analysing the job description (attempt 2 of 3)")).toBeVisible();
    await expect(panel.getByRole("button")).toHaveCount(0);
  });

  test("shows a failure in plain words and Retry starts a new run that completes", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const jobId = await addJob(page, "Failed job");
    await seedAnalysis(jobId, { status: "failed", failureCode: "retries_exhausted", attempts: 3 });
    await page.reload();

    const panel = page.getByRole("region", { name: "Job requirements" });
    await expect(panel.getByText("Analysis failed")).toBeVisible();
    await expect(panel.getByText(/did not finish after several attempts/)).toBeVisible();
    await expect(panel.getByText(/Nothing was saved/)).toBeVisible();

    await panel.getByRole("button", { name: "Retry analysis" }).click();
    await expect(panel.getByRole("heading", { name: "Required skills" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(panel.getByText("Analysis failed")).toHaveCount(0);
  });

  test("a failure only an edit can fix links to the editor and does not offer plain Retry", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    const jobId = await addJob(page, "Too long job");
    await seedAnalysis(jobId, { status: "failed", failureCode: "too_long" });
    await page.reload();

    const panel = page.getByRole("region", { name: "Job requirements" });
    await expect(panel.getByText(/too long to analyse/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Retry analysis" })).toHaveCount(0);
    await expect(panel.getByRole("link", { name: "Edit job" })).toHaveAttribute(
      "href",
      `/jobs/${jobId}/edit`,
    );
    await expect(panel.getByRole("button", { name: "Analyse again" })).toBeVisible();
  });
});
