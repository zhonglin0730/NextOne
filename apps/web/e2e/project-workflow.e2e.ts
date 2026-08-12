import { expect, test, type Page } from "@playwright/test";

const projectName = "E2E 发布准备";
const projectOutcome = "验证项目结构、看板和今日承诺能够连贯工作";
const packageName = "发布候选";
const taskName = "完成发布候选验收";

async function createProject(page: Page): Promise<void> {
  await page.goto("/projects");
  const dismissGuide = page.getByRole("button", { name: "关闭项目工作流引导" });
  if (await dismissGuide.isVisible()) {
    await dismissGuide.click();
  }
  await page.getByRole("button", { name: /新建项目/ }).click();

  const dialog = page.getByRole("dialog", { name: "新建项目" });
  await dialog.getByLabel("项目名称").fill(projectName);
  await dialog.getByLabel("项目说明").fill(projectOutcome);
  await dialog.getByRole("button", { name: "新建项目", exact: true }).click();

  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await expect(page.getByRole("heading", { name: projectName, level: 1 })).toBeVisible();
}

test("project workflow stays connected from structure to board and today", async ({ page }) => {
  await createProject(page);
  const projectUrl = page.url();

  await page.getByRole("button", { name: "添加项目任务" }).click();
  const captureDialog = page.getByRole("dialog", { name: "添加项目任务" });
  await captureDialog.getByPlaceholder("记录一件事……").fill(taskName);
  await captureDialog.getByRole("button", { name: "添加到项目" }).click();

  await expect(page.getByRole("button", { name: new RegExp(taskName) })).toBeVisible();
  await page.getByRole("link", { name: "项目拆解", exact: true }).click();

  await page
    .getByRole("button", { name: /工作包/ })
    .first()
    .click();
  const packageDialog = page.getByRole("dialog", { name: "新建工作包" });
  await packageDialog.getByLabel("工作包名称").fill(packageName);
  await packageDialog.getByRole("button", { name: "创建工作包" }).click();

  await expect(page.getByRole("heading", { name: packageName, level: 3 })).toBeVisible();
  await page.getByLabel(`将“${taskName}”放入工作包`).selectOption({ label: packageName });
  const packageCard = page
    .locator(".work-package-card")
    .filter({ has: page.getByRole("heading", { name: packageName, level: 3 }) })
    .first();
  await expect(packageCard.getByRole("button", { name: new RegExp(taskName) })).toBeVisible();

  await page.getByRole("link", { name: "推进看板", exact: true }).click();
  const readyColumn = page.locator(".board-column-ready");
  let taskCard = readyColumn.locator(".board-card").filter({ hasText: taskName });
  await expect(taskCard).toBeVisible();
  await taskCard.getByRole("button", { name: "开始", exact: true }).click();
  const doingColumn = page.locator(".board-column-doing");
  taskCard = doingColumn.locator(".board-card").filter({ hasText: taskName });
  await expect(taskCard).toBeVisible();

  await page.goto("/today");
  await expect(page.getByText(taskName, { exact: true })).toBeVisible();

  await page.goto(projectUrl);
  taskCard = page.locator(".board-column-doing .board-card").filter({ hasText: taskName });
  await taskCard.getByRole("button", { name: "完成", exact: true }).click();

  const completedPool = page.locator(".project-completed-pool");
  await completedPool.locator("summary").click();
  await completedPool.getByRole("button", { name: new RegExp(taskName) }).click();

  const inspector = page.locator(".project-task-inspector");
  await expect(inspector).toContainText(taskName);
  await inspector.locator("footer button").click();
  await expect(readyColumn.locator(".board-card").filter({ hasText: taskName })).toBeVisible();
});

test("critical pages remain usable at desktop and mobile widths", async ({ page }) => {
  const routes = ["/projects", "/today", "/inbox", "/review", "/settings/general"];

  await page.goto("/projects");
  await page.keyboard.press("Tab");
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator("main h1").first()).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
    }
  }
});
