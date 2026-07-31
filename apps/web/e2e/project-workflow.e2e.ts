import { expect, test, type Page } from "@playwright/test";

const projectName = "E2E 发布准备";
const projectOutcome = "验证项目结构、看板和今日承诺能够连贯工作";
const packageName = "发布候选";
const taskName = "完成发布候选验收";

async function createProject(page: Page): Promise<void> {
  await page.goto("/projects");
  await page.getByRole("button", { name: "关闭项目工作流引导" }).click();
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

  await page.getByRole("button", { name: "添加项目任务" }).click();
  const captureDialog = page.getByRole("dialog", { name: "添加项目任务" });
  await captureDialog.getByPlaceholder("记录一件事……").fill(taskName);
  await captureDialog.getByRole("button", { name: "添加到项目" }).click();

  await expect(page.getByRole("button", { name: new RegExp(taskName) })).toBeVisible();
  await page.getByRole("link", { name: "结构", exact: true }).click();

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

  await page.getByRole("link", { name: "看板", exact: true }).click();
  const readyColumn = page.locator(".board-column-ready");
  let taskCard = readyColumn.locator(".board-card").filter({ hasText: taskName });
  await expect(taskCard).toBeVisible();
  await taskCard.getByRole("button", { name: "加入今天" }).click();
  await expect(taskCard.getByRole("button", { name: "已在今天" })).toBeDisabled();

  await taskCard.getByRole("button", { name: "开始", exact: true }).click();
  const doingColumn = page.locator(".board-column-doing");
  taskCard = doingColumn.locator(".board-card").filter({ hasText: taskName });
  await expect(taskCard).toBeVisible();
  await taskCard.getByRole("button", { name: "完成", exact: true }).click();

  const completedColumn = page.locator(".board-column-completed");
  taskCard = completedColumn.locator(".board-card").filter({ hasText: taskName });
  await expect(taskCard).toBeVisible();

  const sourceBox = await taskCard.locator(".board-card-drag-handle").boundingBox();
  const targetBox = await readyColumn.locator(".board-card-list").boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  if (sourceBox === null || targetBox === null) {
    throw new Error("Drag source or target is not visible");
  }
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 - 8, sourceBox.y + sourceBox.height / 2, {
    steps: 3,
  });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 80, { steps: 10 });
  await page.mouse.up();
  await expect(readyColumn.locator(".board-card").filter({ hasText: taskName })).toBeVisible();
});

test("critical pages remain usable at desktop and mobile widths", async ({ page }) => {
  const routes = ["/projects", "/today", "/inbox", "/review", "/settings/general"];

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
