import { expect, test } from "@playwright/test";

test("pause context survives reload and is shared by project, today and daily close", async ({
  page,
}) => {
  // All data belongs to this isolated browser context. Never sync QA fixtures to the user's API.
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/projects");
  await page
    .getByRole("button", { name: /新建项目/ })
    .first()
    .click();
  const projectDialog = page.getByRole("dialog", { name: "新建项目" });
  await projectDialog.getByLabel("项目名称").fill("继续推进验收");
  await projectDialog.getByRole("button", { name: "新建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const projectUrl = page.url();
  await page.getByRole("button", { name: "添加项目任务" }).click();
  const capture = page.getByRole("dialog", { name: "添加项目任务" });
  await capture.getByPlaceholder("记录一件事……").fill("联调退款接口");
  await capture.getByRole("button", { name: "添加到项目" }).click();
  await page
    .locator(".board-column-ready .board-card")
    .getByRole("button", { name: "开始", exact: true })
    .click();
  await page.goto("/today");
  await page.locator(".today-task-card").hover();
  await page
    .locator(".today-task-card")
    .getByRole("button", { name: "暂停推进", exact: true })
    .click();
  const pause = page.getByRole("dialog", { name: "先停在这里" });
  await expect(pause).toBeVisible();
  await pause.getByLabel("下次从哪里继续（选填）").fill("不应保存的草稿");
  await page.keyboard.press("Escape");
  await expect(pause).not.toBeVisible();
  await expect(page.locator(".today-task-card .status-badge")).toHaveText("进行中");

  await page.locator(".today-task-card").hover();
  await page
    .locator(".today-task-card")
    .getByRole("button", { name: "暂停推进", exact: true })
    .click();
  await pause.getByLabel("下次从哪里继续（选填）").fill("接口已联调，下次补退款失败测试。");
  await pause.getByRole("button", { name: "保存并暂停" }).click();
  await expect(pause).not.toBeVisible();
  await page.reload();
  await expect(page.locator(".today-task-card")).toContainText("下次补退款失败测试");
  await page.goto("/review/daily");
  await expect(page.locator(".daily-close-task-list")).toContainText("下次补退款失败测试");
  await page.getByRole("button", { name: "修改继续点" }).click();
  const editor = page.getByRole("dialog", { name: "留给下次的自己" });
  await editor.getByLabel("下次从哪里继续（选填）").fill("下次打开退款测试文件，补余额不足用例。");
  await editor.getByRole("button", { name: "保存继续点" }).click();
  await page.goto(projectUrl);
  const resume = page.locator(".project-resume-list");
  await expect(resume).toContainText("补余额不足用例");

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await expect(resume.getByRole("button", { name: "继续这项任务" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `docs/PRD/web/ui-qa/2026-09-06-resume/after-project-${viewport.width}x${viewport.height}.png`,
    });
    await resume.getByRole("button", { name: "修改继续点" }).click();
    await expect(editor).toBeVisible();
    await page.screenshot({
      path: `docs/PRD/web/ui-qa/2026-09-06-resume/after-editor-${viewport.width}x${viewport.height}.png`,
    });
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await resume.getByRole("button", { name: "修改继续点" }).click();
  await expect(editor).toBeVisible();
  await page.screenshot({
    path: "docs/PRD/web/ui-qa/2026-09-06-resume/after-editor-dark-390x844.png",
  });
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "light";
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await resume.getByRole("button", { name: "继续这项任务" }).click();
  await expect(resume).not.toBeVisible();
  await expect(page.locator(".board-column-doing")).toContainText("联调退款接口");
  await page.goto("/today");
  await expect(page.locator(".today-task-card")).toContainText("补余额不足用例");
  await page.locator(".today-task-card").hover();
  await page
    .locator(".today-task-card")
    .getByRole("button", { name: "暂停推进", exact: true })
    .click();
  await pause.getByRole("button", { name: "直接暂停" }).click();
  await expect(page.locator(".today-task-card")).toContainText("补余额不足用例");
  await page.goto(projectUrl);
  await resume.getByRole("button", { name: "修改继续点" }).click();
  await editor.getByLabel("下次从哪里继续（选填）").fill("");
  await editor.getByRole("button", { name: "保存继续点" }).click();
  await expect(resume).not.toBeVisible();
  await page.locator(".project-task-inspector").getByRole("button", { name: "编辑详情" }).click();
  const drawer = page.locator(".task-drawer");
  const titleInput = drawer.locator(".task-form input").first();
  await titleInput.fill("联调退款接口（标题草稿）");
  await drawer.getByRole("button", { name: "留一句下次继续点" }).click();
  await editor.getByLabel("下次从哪里继续（选填）").fill("从余额不足用例继续");
  await editor.getByRole("button", { name: "保存继续点" }).click();
  await expect(titleInput).toHaveValue("联调退款接口（标题草稿）");
  await drawer.getByRole("button", { name: "保存", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await page.goto("/today");
  await page.locator(".today-task-card").getByRole("button", { name: "开始", exact: true }).click();
  await page.locator(".today-task-card").getByRole("button", { name: "专注", exact: true }).click();
  const zen = page.locator(".zen-mode");
  await zen.getByRole("button", { name: "暂停任务并留在今天" }).click();
  await expect(pause).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zen).toBeVisible();
  await zen.getByRole("button", { name: "暂停任务并留在今天" }).click();
  await pause.getByRole("button", { name: "直接暂停" }).click();
  await expect(zen).not.toBeVisible();
  await expect(page.locator(".today-task-card .status-badge")).toHaveText("待开始");
});
