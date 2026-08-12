import { test, expect } from "@playwright/test";

const mockSupabase = async (page) => {
  await page.route("**/e2e-supabase/auth/v1/user**", async (route) => {
    const id =
      new URL(route.request().url()).searchParams.get("e2eUser") ||
      new URL(page.url() || "http://x/?e2eUser=e2e-user").searchParams.get(
        "e2eUser",
      ) ||
      "e2e-user";
    await route.fulfill({
      json: {
        id,
        email: `${id}@example.test`,
        user_metadata: { username: id },
      },
    });
  });
  await page.route("**/e2e-supabase/rest/v1/matches**", async (route) => {
    const url = new URL(route.request().url());
    const id = String(url.searchParams.get("id") || "").replace("eq.", "");
    const response = await page.request.get(
      `http://127.0.0.1:5051/e2e/matches/${id}`,
    );
    const body = await response.json();
    const single = String(route.request().headers().accept || "").includes(
      "application/vnd.pgrst.object",
    );
    await route.fulfill({
      json: single ? body : [body],
      headers: { "content-range": "0-0/1" },
    });
  });
  await page.route("**/e2e-supabase/rest/v1/votes**", (route) =>
    route.fulfill({ json: [] }),
  );
};

test("two browsers complete matchmaking, turns, rejoin, timeout, judging, vote, and appeal", async ({
  browser,
}) => {
  const criticContext = await browser.newContext();
  const defenderContext = await browser.newContext();
  const critic = await criticContext.newPage();
  const defender = await defenderContext.newPage();
  await Promise.all([mockSupabase(critic), mockSupabase(defender)]);
  await Promise.all([
    critic.goto("/lobby/e2e-topic?e2eUser=critic"),
    defender.goto("/lobby/e2e-topic?e2eUser=defender"),
  ]);
  await critic.getByRole("button", { name: "Choose Critic role" }).click();
  await defender.getByRole("button", { name: "Choose Defender role" }).click();
  await critic.getByRole("button", { name: "Enter Arena" }).click();
  await defender.getByRole("button", { name: "Enter Arena" }).click();
  await expect(critic).toHaveURL(/\/arena\//);
  await expect(defender).toHaveURL(/\/arena\//);
  const criticInput = critic.locator("textarea").last();
  await criticInput.fill(
    "A controlled study supports this claim because the treatment group improved.",
  );
  await critic.getByRole("button", { name: "Send" }).click();
  const defenderInput = defender.locator("textarea").last();
  await defenderInput.fill(
    "However, the sample is small and the conclusion should remain calibrated.",
  );
  await defender.getByRole("button", { name: "Send" }).click();
  const roomPath = new URL(critic.url()).pathname;
  await critic.reload();
  await expect(critic).toHaveURL(roomPath);
  await expect(
    critic.getByText(/resumed|Critic|active/i).first(),
  ).toBeVisible();
  await critic
    .locator("textarea")
    .last()
    .fill(
      "The effect is still meaningful, and a larger replication would test durability.",
    );
  await critic.getByRole("button", { name: "Send" }).click();
  await defender
    .locator("textarea")
    .last()
    .fill(
      "I concede the direction while disputing the strength of the causal estimate.",
    );
  await defender.getByRole("button", { name: "Send" }).click();
  await expect(critic).toHaveURL(/\/review\//, { timeout: 10_000 });
  await expect(critic.getByText("AI Highlights")).toBeVisible();
  await critic.getByRole("button", { name: "Appeal" }).click();
  await critic
    .getByLabel("Specific reason")
    .fill(
      "The evidence dimension did not account for the controlled comparison.",
    );
  await critic.getByRole("button", { name: "Submit appeal" }).click();
  await expect(
    critic.getByText(/Independent appeal review completed/),
  ).toBeVisible();
  const audienceContext = await browser.newContext();
  const audience = await audienceContext.newPage();
  await mockSupabase(audience);
  await audience.goto(`${critic.url()}?e2eUser=audience`);
  await audience
    .getByRole("button", { name: /Critic/i })
    .last()
    .click();
  await expect(audience.getByText("Vote Submitted")).toBeVisible();
  await criticContext.close();
  await defenderContext.close();
  await audienceContext.close();
});

test("teacher and student complete classroom join, assignment, submission, integrity, grade, and export lifecycle", async ({
  browser,
}) => {
  const teacherContext = await browser.newContext();
  const studentContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  const student = await studentContext.newPage();
  await Promise.all([
    teacher.goto("/arena-os?e2eUser=teacher"),
    student.goto("/arena-os?e2eUser=student"),
  ]);
  await Promise.all([
    teacher.getByRole("button", { name: "Classrooms" }).click(),
    student.getByRole("button", { name: "Classrooms" }).click(),
  ]);
  await teacher.getByRole("button", { name: /New assignment/ }).click();
  await teacher.getByLabel("Assignment title").fill("Evidence Gate");
  await teacher
    .getByLabel("Debate topic")
    .fill("Should launch gates require controlled evidence?");
  await teacher.getByRole("button", { name: "Publish assignment" }).click();
  await student.getByRole("button", { name: /Join with code/ }).click();
  await student.getByLabel("Join code").fill("SA-E2E01");
  await student.getByRole("button", { name: "Join classroom" }).click();
  await student.reload();
  await student.getByRole("button", { name: "Classrooms" }).click();
  await student.getByRole("button", { name: "Complete & submit" }).click();
  await student
    .getByLabel("Your argument or transcript")
    .fill(
      "A controlled study reports 20 percent improvement according to https://example.edu/study and the mechanism is explicit.",
    );
  await student.getByRole("button", { name: "Submit for grading" }).click();
  await teacher.reload();
  await teacher.getByRole("button", { name: "Classrooms" }).click();
  await teacher.getByRole("button", { name: "Analytics & grading" }).click();
  await expect(teacher.getByText("student", { exact: true })).toBeVisible();
  teacher.on("dialog", async (dialog) => {
    await dialog.accept(
      dialog.message().startsWith("Grade ")
        ? "95"
        : "Strong evidence and a clear warrant.",
    );
  });
  await teacher
    .getByRole("button", { name: /student.*Evidence Gate/i })
    .click();
  await expect(
    teacher.getByRole("button", { name: /student.*Evidence Gate.*95/i }),
  ).toBeVisible();
  const download = teacher.waitForEvent("download");
  await teacher.getByRole("button", { name: "Export CSV" }).click();
  await download;
  await teacherContext.close();
  await studentContext.close();
});
