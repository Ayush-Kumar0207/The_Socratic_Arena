import { test, expect } from "@playwright/test";

test("practice completion clearly prepares results instead of implying another round", async ({
  page,
}) => {
  await page.goto("/practice?topic=Should+AI+systems+be+granted+legal+personhood%3F&stance=for&mode=sparring");

  const input = page.locator("textarea");
  for (let round = 1; round <= 3; round += 1) {
    await input.fill(`Round ${round}: I answer the objection with a claim, evidence, and calibrated warrant.`);
    await input.press("Enter");
    await expect(
      page.getByText(`A rigorous counterargument to round ${round}, followed by one probing question.`),
    ).toBeVisible();
  }

  await expect(page.getByText("3 rounds complete · continue or finish")).toBeVisible();
  await page.getByRole("button", { name: "Finish and score this session" }).click();

  await expect(page.getByText("Session complete · preparing your results")).toBeVisible();
  await expect(page.getByText("Preparing your final score", { exact: true })).toBeVisible();
  await expect(page.getByText(/Round 4/)).toHaveCount(0);
  await expect(page.getByText("Practice complete")).toBeVisible();
});

test("practice allowance exhaustion explains that the rest of the product remains available", async ({
  page,
}) => {
  await page.route("**/api/product/practice/respond", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        code: "DAILY_AI_ALLOWANCE_REACHED",
        message:
          "You've reached today's AI practice allowance. Ranked debates and the rest of Socratic Arena remain available. AI practice resets tomorrow.",
      }),
    }),
  );
  await page.goto("/practice?topic=Launch+day+test&stance=for&mode=sparring");
  await page.locator("textarea").fill("A test argument with evidence and a calibrated warrant.");
  await page.locator("textarea").press("Enter");

  await expect(page.getByRole("alert")).toContainText("Ranked debates and the rest of Socratic Arena remain available");
  await expect(page.getByRole("alert")).toContainText("resets tomorrow");
});

test("Arena OS action errors remain visible after the page has scrolled", async ({ page }) => {
  await page.goto("/arena-os");
  await page.getByRole("button", { name: "Trust", exact: true }).click();
  await page.getByRole("button", { name: "Issue current reasoning credential" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert).toHaveCSS("position", "fixed");
  await expect(alert).toBeInViewport();
});

test("founders can join the Pro waitlist without entering a billing flow", async ({ page }) => {
  await page.goto("/arena-os");
  await page.getByRole("button", { name: "Join Pro waitlist" }).click();

  await expect(page.getByText("You're on the Socratic Arena Pro waitlist.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pro waitlist joined" })).toBeDisabled();
});

test("navbar keeps primary options single-line and switches to the menu before crowding", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/arena-os");

  for (const name of ["Dashboard", "Explore", "My Arena", "Arena OS"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByLabel("Open navigation menu")).toBeHidden();

  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByLabel("Open navigation menu")).toBeVisible();
  await expect(page.getByRole("link", { name: "Dashboard", exact: true })).toBeHidden();
});
