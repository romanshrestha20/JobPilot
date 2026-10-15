import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { seedSkills, signInViaApi as signIn, storedSkills } from "./support";

const skills = (page: Page) => page.getByRole("region", { name: "Skills" });
const skillList = (page: Page) => page.getByRole("list", { name: "Your skills" });
const addForm = (page: Page) => page.getByRole("form", { name: "Add a skill" });

/** Submits a form and waits for the Server Action's response, so later checks cannot race it. */
async function submit(page: Page, button: Locator) {
  await Promise.all([
    page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/profile")),
    button.click(),
  ]);
}

async function addSkill(
  page: Page,
  skill: { name: string; level?: string; years?: string; evidence?: string },
) {
  const form = addForm(page);
  await form.getByLabel("Skill name").fill(skill.name);
  if (skill.level) await form.getByLabel("Level").selectOption({ label: skill.level });
  if (skill.years) await form.getByLabel("Years with this skill").fill(skill.years);
  if (skill.evidence) await form.getByLabel("Evidence").fill(skill.evidence);
  await submit(page, form.getByRole("button", { name: "Add skill" }));
  // The response arrives before React commits the action's result and resets the form, so the
  // next fill could be wiped. The button reads "Adding…" until that commit. Every outcome ends
  // with the button back (success, validation or duplicate error, stale-form limit error),
  // except a successful 50th skill, which replaces the form with the limit alert.
  await expect(
    form
      .getByRole("button", { name: "Add skill" })
      .or(page.getByText(/You have reached the limit of 50 skills/)),
  ).toBeVisible();
}

async function noHorizontalOverflow(page: Page, label: string) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `${label}: page scrolls horizontally`).toBeLessThanOrEqual(clientWidth);
  const outside = await page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    return [...document.querySelectorAll("main *")]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && (box.right > limit + 1 || box.left < -1);
      })
      .map((el) => el.tagName.toLowerCase());
  });
  expect(outside, `${label}: elements outside the viewport`).toEqual([]);
}

test.describe("candidate skills", () => {
  test("adds a skill with every field and shows it again after reload", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await expect(skills(page).getByRole("heading", { name: "Skills" })).toBeVisible();
    await expect(page.getByText("No skills yet.")).toBeVisible();
    await expect(skills(page).getByText("(0 of 50)")).toBeVisible();

    await addSkill(page, {
      name: "TypeScript",
      level: "Advanced",
      years: "6",
      evidence: "Built the typed API behind our billing service.",
    });

    await expect(page.getByText("Added TypeScript.")).toBeVisible();
    // The form is cleared for the next skill.
    await expect(addForm(page).getByLabel("Skill name")).toHaveValue("");

    await page.reload();
    const item = skillList(page).getByRole("listitem").filter({ hasText: "TypeScript" });
    await expect(item).toContainText("Advanced");
    await expect(item).toContainText("6 years");
    await expect(item).toContainText("Built the typed API behind our billing service.");
    await expect(skills(page).getByText("(1 of 50)")).toBeVisible();

    expect(await storedSkills(registeredUser.email)).toEqual([
      {
        skillKey: "typescript",
        displayName: "TypeScript",
        level: "advanced",
        yearsOfExperience: 6,
        evidence: "Built the typed API behind our billing service.",
      },
    ]);
  });

  test("a skill needs only a name", async ({ page, registeredUser, origin }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");

    await addSkill(page, { name: "Docker" });

    const item = skillList(page).getByRole("listitem").filter({ hasText: "Docker" });
    await expect(item).toBeVisible();
    await expect(item.getByText(/year/)).toHaveCount(0);
    expect(await storedSkills(registeredUser.email)).toMatchObject([
      { displayName: "Docker", level: null, yearsOfExperience: null, evidence: null },
    ]);
  });

  test("does not change the other profile fields, in either direction", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await page.getByLabel("Headline").fill("Backend engineer");
    await submit(page, page.getByRole("button", { name: "Save profile" }));
    await expect(page.getByText("Profile saved.")).toBeVisible();

    await addSkill(page, { name: "Go" });
    await page.reload();
    await expect(page.getByLabel("Headline")).toHaveValue("Backend engineer");

    await page.getByLabel("Headline").fill("Staff engineer");
    await submit(page, page.getByRole("button", { name: "Save profile" }));
    await page.reload();
    await expect(skillList(page).getByRole("listitem")).toHaveCount(1);
    await expect(page.getByLabel("Headline")).toHaveValue("Staff engineer");
  });

  test("rejects invalid input on the server, even when browser validation is bypassed", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>('form[aria-label="Add a skill"]')!;
      form.noValidate = true;
      form.querySelector("input[name=yearsOfExperience]")?.removeAttribute("max");
      form.querySelector("input[name=name]")?.removeAttribute("required");
    });
    const form = addForm(page);

    await form.getByLabel("Years with this skill").fill("61");
    await submit(page, form.getByRole("button", { name: "Add skill" }));
    await expect(form.getByText("Please fix the highlighted fields.")).toBeVisible();
    await expect(form.getByText("Enter a skill name.")).toBeVisible();
    await expect(form.getByText("Use 60 years or fewer.")).toBeVisible();
    await expect(form.getByLabel("Skill name")).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel("Years with this skill")).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel("Years with this skill")).toHaveValue("61");

    await form.getByLabel("Skill name").fill("Rust");
    await form.getByLabel("Years with this skill").fill("2.5");
    await submit(page, form.getByRole("button", { name: "Add skill" }));
    await expect(form.getByText("Enter a whole number of years.")).toBeVisible();

    await form.getByLabel("Years with this skill").fill("");
    await form.getByLabel("Evidence").fill("x".repeat(501));
    await form.getByLabel("Evidence").evaluate((el) => el.removeAttribute("maxlength"));
    await form.getByLabel("Evidence").fill("x".repeat(501));
    await submit(page, form.getByRole("button", { name: "Add skill" }));
    await expect(form.getByText("Use at most 500 characters.")).toBeVisible();

    expect(await storedSkills(registeredUser.email)).toEqual([]);
  });

  test("rejects a duplicate skill however it is typed", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await addSkill(page, { name: "TypeScript" });
    await expect(page.getByText("Added TypeScript.")).toBeVisible();

    await addSkill(page, { name: "  typescript " });

    await expect(addForm(page).getByText(/You already have this skill/)).toBeVisible();
    await expect(addForm(page).getByLabel("Skill name")).toHaveAttribute("aria-invalid", "true");
    await expect(skillList(page).getByRole("listitem")).toHaveCount(1);
    expect(await storedSkills(registeredUser.email)).toHaveLength(1);
  });

  test("edits a skill in place, can cancel, and rejects renaming into a duplicate", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await addSkill(page, { name: "Python", level: "Beginner" });
    await addSkill(page, { name: "Rust" });
    const item = (name: string) => skillList(page).getByRole("listitem").filter({ hasText: name });

    // Cancel leaves the skill untouched and returns focus to the Edit button.
    await page.getByRole("button", { name: "Edit Python" }).click();
    await expect(
      page.getByRole("form", { name: "Edit Python" }).getByLabel("Skill name"),
    ).toBeFocused();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Edit Python" })).toBeFocused();

    // A real edit.
    await page.getByRole("button", { name: "Edit Python" }).click();
    const edit = page.getByRole("form", { name: "Edit Python" });
    await expect(edit.getByLabel("Skill name")).toHaveValue("Python");
    await expect(edit.getByLabel("Level")).toHaveValue("beginner");
    await edit.getByLabel("Level").selectOption({ label: "Expert" });
    await edit.getByLabel("Years with this skill").fill("9");
    await edit.getByLabel("Evidence").fill("Data pipelines.");
    await submit(page, edit.getByRole("button", { name: "Save skill" }));

    await expect(item("Python")).toContainText("Expert");
    await expect(item("Python")).toContainText("9 years");
    await expect(item("Python")).toContainText("Data pipelines.");
    await expect(page.getByRole("button", { name: "Edit Python" })).toBeFocused();
    await expect(skillList(page).getByRole("listitem")).toHaveCount(2);

    // Renaming into another skill is a duplicate and changes nothing.
    await page.getByRole("button", { name: "Edit Python" }).click();
    const rename = page.getByRole("form", { name: "Edit Python" });
    await rename.getByLabel("Skill name").fill("RUST");
    await submit(page, rename.getByRole("button", { name: "Save skill" }));
    await expect(rename.getByText(/You already have this skill/)).toBeVisible();
    await rename.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Edit Python" }).click();
    // The failed attempt is not shown again.
    await expect(
      page.getByRole("form", { name: "Edit Python" }).getByLabel("Skill name"),
    ).toHaveValue("Python");

    const stored = await storedSkills(registeredUser.email);
    expect(stored.map((s) => s.displayName).sort()).toEqual(["Python", "Rust"]);
    expect(stored.find((s) => s.displayName === "Python")).toMatchObject({
      level: "expert",
      yearsOfExperience: 9,
      evidence: "Data pipelines.",
    });
  });

  test("removes a skill only after confirmation", async ({ page, registeredUser, origin }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await addSkill(page, { name: "Perl" });
    await addSkill(page, { name: "Ruby" });

    await page.getByRole("button", { name: "Remove Perl" }).click();
    await expect(page.getByText("Remove Perl from your profile?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();

    // Cancel keeps it.
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("button", { name: "Remove Perl" })).toBeFocused();
    expect(await storedSkills(registeredUser.email)).toHaveLength(2);

    await page.getByRole("button", { name: "Remove Perl" }).click();
    await submit(page, page.getByRole("button", { name: "Yes, remove" }));

    await expect(skillList(page).getByRole("listitem")).toHaveCount(1);
    await expect(skillList(page).getByText("Perl")).toHaveCount(0);
    await expect(skills(page).getByRole("heading", { name: "Skills" })).toBeFocused();
    expect((await storedSkills(registeredUser.email)).map((s) => s.displayName)).toEqual(["Ruby"]);
  });

  test("enforces the 50-skill limit and frees a slot after removal", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await seedSkills(registeredUser.email, 50);
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");

    await expect(skills(page).getByText("(50 of 50)")).toBeVisible();
    await expect(page.getByText(/You have reached the limit of 50 skills/)).toBeVisible();
    await expect(addForm(page)).toHaveCount(0);
    await expect(skillList(page).getByRole("listitem")).toHaveCount(50);

    await page.getByRole("button", { name: "Remove Seed Skill 1", exact: true }).click();
    await submit(page, page.getByRole("button", { name: "Yes, remove" }));
    await expect(addForm(page)).toBeVisible();
    await expect(skills(page).getByText("(49 of 50)")).toBeVisible();

    await addSkill(page, { name: "Fiftieth" });
    await expect(skills(page).getByText("(50 of 50)")).toBeVisible();
    expect(await storedSkills(registeredUser.email)).toHaveLength(50);
  });

  test("rejects the 51st skill on the server when the form is stale", async ({
    page,
    registeredUser,
    origin,
  }) => {
    await seedSkills(registeredUser.email, 49);
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    // Another tab fills the last slot while this page still shows the form.
    await seedSkills(registeredUser.email, 1, "Other Tab");
    await addSkill(page, { name: "Late One" });

    await expect(addForm(page).getByText(/You can keep up to 50 skills/)).toBeVisible();
    await expect(addForm(page).getByLabel("Skill name")).toHaveValue("Late One");
    expect(await storedSkills(registeredUser.email)).toHaveLength(50);
  });

  test("keeps each user's skills private", async ({ page, registeredUser, request, origin }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    await addSkill(page, { name: "Private to user A" });
    await expect(page.getByText("Added Private to user A.")).toBeVisible();

    const other = {
      name: "Other",
      email: `e2e-other-${Date.now()}-${Math.random().toString(16).slice(2)}@example.invalid`,
      password: "other-password-123",
    };
    await request.post("/api/auth/sign-up/email", { data: other, headers: { origin } });
    // Leave the page before clearing the session: a live signed-in page makes Next's background
    // prefetches hit the proxy redirect, and the redirected RSC request logs a 404 to the console.
    await page.goto("about:blank");
    await page.context().clearCookies();
    await signIn(page, other, origin);
    await page.goto("/profile");

    await expect(page.getByText("No skills yet.")).toBeVisible();
    await expect(page.getByText("Private to user A")).toHaveCount(0);
    // The same name is free for the second user.
    await addSkill(page, { name: "Private to user A" });
    await expect(page.getByText("Added Private to user A.")).toBeVisible();
    expect(await storedSkills(registeredUser.email)).toHaveLength(1);
    expect(await storedSkills(other.email)).toHaveLength(1);
  });

  test("is fully usable with the keyboard", async ({ page, registeredUser, origin }) => {
    await signIn(page, registeredUser, origin);
    await page.goto("/profile");
    const form = addForm(page);

    await form.getByLabel("Skill name").focus();
    await page.keyboard.type("Elixir");
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Level")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Years with this skill")).toBeFocused();
    await page.keyboard.type("3");
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Evidence")).toBeFocused();
    await page.keyboard.press("Tab");
    const addButton = form.getByRole("button", { name: "Add skill" });
    await expect(addButton).toBeFocused();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/profile")),
      page.keyboard.press("Enter"),
    ]);
    await expect(skillList(page).getByText("Elixir")).toBeVisible();

    // Edit and remove are reachable and operable by keyboard alone.
    await page.getByRole("button", { name: "Edit Elixir" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("form", { name: "Edit Elixir" }).getByLabel("Skill name"),
    ).toBeFocused();
    await page.getByRole("button", { name: "Cancel" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Edit Elixir" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Remove Elixir" })).toBeFocused();
  });

  test("signed-out visitors cannot reach the skills", async ({ page }) => {
    await page.goto("/profile");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fprofile$/);
    await expect(page.getByRole("region", { name: "Skills" })).toHaveCount(0);
  });
});

test.describe("skills layout", () => {
  const LONG_NAME = "S".repeat(80);
  const LONG_EVIDENCE = "E".repeat(500);

  for (const { width, label } of [
    { width: 375, label: "375px" },
    { width: 1280, label: "1280px" },
  ]) {
    for (const colorScheme of ["light", "dark"] as const) {
      test(`long unbroken text does not overflow at ${label} (${colorScheme})`, async ({
        page,
        registeredUser,
        origin,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.emulateMedia({ colorScheme });
        await signIn(page, registeredUser, origin);
        await page.goto("/profile");
        await expect(skills(page)).toBeVisible();
        await noHorizontalOverflow(page, `${label} empty`);

        await addSkill(page, {
          name: LONG_NAME,
          level: "Intermediate",
          years: "12",
          evidence: LONG_EVIDENCE,
        });
        const item = skillList(page).getByRole("listitem").first();
        await expect(item).toContainText(LONG_NAME);
        await noHorizontalOverflow(page, `${label} list`);

        await page.getByRole("button", { name: `Edit ${LONG_NAME}` }).click();
        await expect(page.getByRole("form", { name: `Edit ${LONG_NAME}` })).toBeVisible();
        await noHorizontalOverflow(page, `${label} edit`);
        await page.getByRole("button", { name: "Cancel" }).click();

        await page.getByRole("button", { name: `Remove ${LONG_NAME}` }).click();
        await expect(page.getByRole("alert").filter({ hasText: "Remove" })).toBeVisible();
        await noHorizontalOverflow(page, `${label} confirm`);

        // A failed add: errors and echoed values stay inside the viewport too.
        await page.getByRole("button", { name: "Cancel" }).click();
        await addSkill(page, { name: LONG_NAME.toLowerCase() });
        await expect(addForm(page).getByText(/You already have this skill/)).toBeVisible();
        await noHorizontalOverflow(page, `${label} duplicate error`);
      });
    }
  }
});
