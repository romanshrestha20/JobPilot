import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signInViaApi } from "./support";

// Real worker (demo extractor), real production build, guarded test database. The demo
// extractor is keyword based, so the job text names its skills plainly.
const DESCRIPTION = [
  "Backend engineer",
  "",
  "Requirements:",
  "- TypeScript",
  "- PostgreSQL",
  "",
  "Nice to have:",
  "- Docker",
].join("\n");

async function addSkill(
  page: Page,
  skill: { name: string; level?: string; years?: string; evidence?: string },
) {
  const form = page.getByRole("form", { name: "Add a skill" });
  await form.getByLabel("Skill name").fill(skill.name);
  if (skill.level) await form.getByLabel("Level").selectOption({ label: skill.level });
  if (skill.years) await form.getByLabel("Years with this skill").fill(skill.years);
  if (skill.evidence) await form.getByLabel("Evidence").fill(skill.evidence);
  const button: Locator = form.getByRole("button", { name: "Add skill" });
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/profile")),
    button.click(),
  ]);
  await expect(button).toBeVisible(); // the form is back, so the next fill cannot be wiped
}

async function analyseNewJob(page: Page, title: string) {
  await page.goto("/jobs/new");
  await page.getByLabel("Job title").fill(title);
  await page.getByLabel("Company").fill("Acme Oy");
  await page.getByLabel("Job description").fill(DESCRIPTION);
  await page.getByRole("button", { name: "Save job" }).click();
  await expect(page).toHaveURL(/\/jobs\/[0-9a-f-]{36}\?saved=1$/);
  const jobs = page.getByRole("region", { name: "Job requirements" });
  await jobs.getByRole("button", { name: "Analyse job" }).click();
  await expect(jobs.getByRole("heading", { name: "Required skills" })).toBeVisible({
    timeout: 30_000,
  });
}

test.describe("match with your profile", () => {
  test.setTimeout(90_000);

  test("with skills: a score, a labelled breakdown, states in words, and the profile link", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/profile");
    await addSkill(page, {
      name: "TypeScript",
      level: "Advanced",
      years: "4",
      evidence: "Built internal APIs.",
    });
    await addSkill(page, { name: "PostgreSQL" }); // listed only: no level or evidence
    await analyseNewJob(page, "Backend engineer");

    const match = page.getByRole("region", { name: "Match with your profile" });
    // Required (1 + 0.5) / 2 and preferred 0 over 65 assessable weight: 58, "Partial overlap".
    await expect(match.getByText("58 out of 100")).toBeVisible();
    await expect(match.getByText("Partial overlap")).toBeVisible();
    await expect(match.getByText(/% of the scoring weight could be assessed/)).toBeVisible();
    await expect(
      match.getByText("Scoring match-v1, skill list skills-v1.", { exact: false }),
    ).toBeVisible();
    await expect(
      match.getByText(/not a prediction of whether you will be invited or hired/),
    ).toBeVisible();

    // The per-part table sits in a disclosure (open by default only when there is no score).
    await match.locator("summary", { hasText: "How each part contributed" }).click();
    const table = match.getByRole("table", { name: "How each part contributed to the match" });
    await expect(table.getByRole("rowheader", { name: "Required skills" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Weight" })).toBeVisible();

    // Skills are grouped by state: each state (and its explanation) appears once, as words.
    await expect(match.getByRole("heading", { name: "Required skills", level: 3 })).toBeVisible();
    await expect(match.getByRole("heading", { name: "Preferred skills", level: 3 })).toBeVisible();
    const requiredGroup = match.getByText("Matched", { exact: true });
    await expect(requiredGroup).toHaveCount(1);
    await expect(match.getByText("TypeScript (Advanced · 4 years)")).toBeVisible();
    await expect(match.getByText("Listed", { exact: true })).toHaveCount(1);
    await expect(match.getByText(/without level or evidence/)).toHaveCount(1);
    await expect(match.getByText("PostgreSQL", { exact: true })).toBeVisible();
    await expect(match.getByText("Not in your profile", { exact: true })).toHaveCount(1);
    await expect(match.getByText("Docker", { exact: true })).toBeVisible();
    await expect(match.locator("[title]")).toHaveCount(0);
  });

  test("without skills: not enough information, no number, and a link to the profile", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await analyseNewJob(page, "Backend engineer");

    const match = page.getByRole("region", { name: "Match with your profile" });
    await expect(match.getByText("Not enough information to score")).toBeVisible();
    await expect(match.getByText(/\d+ out of 100/)).toHaveCount(0);
    await expect(match.getByText("Add skills to your profile", { exact: true })).toBeVisible();
    await expect(match.getByRole("link", { name: "Go to your profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
    await expect(match.getByText(/not a prediction/)).toBeVisible();
  });

  test("before any analysis it invites the user to analyse, and shows no score", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/new");
    await page.getByLabel("Job title").fill("Not yet analysed");
    await page.getByLabel("Company").fill("Acme Oy");
    await page.getByLabel("Job description").fill(DESCRIPTION);
    await page.getByRole("button", { name: "Save job" }).click();
    await expect(page).toHaveURL(/\?saved=1$/);
    const match = page.getByRole("region", { name: "Match with your profile" });
    await expect(match.getByText(/Analyse this job to see how your profile matches/)).toBeVisible();
    await expect(match.getByText(/out of 100/)).toHaveCount(0);
  });

  test("another user's job id shows only the plain not-found page", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signInViaApi(page, registeredUser, origin);
    await page.goto("/jobs/33333333-3333-4333-8333-333333333333");
    await expect(page.getByText("This page could not be found.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Match with your profile" })).toHaveCount(0);
  });
});
