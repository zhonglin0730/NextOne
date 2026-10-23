import { expect, test } from "@playwright/test";

test("workspace search supports keyboard, empty results and project navigation", async ({
  page,
}) => {
  // Isolated browser storage: never send test data to the user's API.
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/projects");
  await page
    .getByRole("button", { name: /新建项目/ })
    .first()
    .click();
  const create = page.getByRole("dialog", { name: "新建项目" });
  await create.getByLabel("项目名称").fill("搜索验收项目");
  await create.getByRole("button", { name: "新建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const destination = page.url();
  await page.goto("/today");
  await page.keyboard.press("Control+k");
  const search = page.getByRole("dialog", { name: "搜索", exact: true });
  await expect(search).toBeVisible();
  await expect(search.getByRole("searchbox")).toBeFocused();
  await search.getByRole("searchbox").fill("不存在的项目xyz");
  await expect(search).toContainText("没有找到相关项目或任务");
  await search.getByRole("searchbox").fill("搜索验收");
  await search.getByRole("button", { name: "搜索验收项目 项目" }).click();
  await expect(page).toHaveURL(destination);
  await expect(search).not.toBeVisible();
  await page.getByRole("button", { name: "添加项目任务" }).click();
  const capture = page.getByRole("dialog", { name: "添加项目任务" });
  await capture.getByPlaceholder("记录一件事……").fill("搜索任务详情验收");
  await page.keyboard.press("Control+k");
  await expect(search).not.toBeVisible();
  await expect(capture).toBeVisible();
  await capture.getByRole("button", { name: "添加到项目" }).click();
  await expect(capture).not.toBeVisible();
  await page.keyboard.press("Control+k");
  await search.getByRole("searchbox").fill("搜索任务详情验收");
  await expect(search.getByRole("button", { name: /搜索任务详情验收/ })).toBeVisible();
  await search.getByRole("searchbox").press("ArrowDown");
  await expect(search.getByRole("button", { name: /搜索任务详情验收/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".task-drawer")).toBeVisible();
  await expect(search).not.toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(search).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".task-drawer")).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator(".shell-search").click();
  await expect(search).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(search).not.toBeVisible();
});

test("inbox preview, reminders and responsive surfaces remain coherent", async ({ page }) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/projects");
  await page
    .getByRole("button", { name: /新建项目/ })
    .first()
    .click();
  const create = page.getByRole("dialog", { name: "新建项目" });
  await create.getByLabel("项目名称").fill("缺少任务的项目");
  await create.getByRole("button", { name: "新建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await page.goto("/today");
  await expect(page.locator(".review-brief")).toContainText("缺少任务的项目");
  await expect(page.locator(".review-brief")).not.toContainText("目前没有需要处理");
  await page.goto("/projects");
  for (const title of ["收件预览甲", "收件预览乙"]) {
    await page.getByRole("button", { name: "快速记录", exact: true }).click();
    const capture = page.getByRole("dialog", { name: "快速记录", exact: true });
    await capture.getByPlaceholder("记录一件事……").fill(title);
    await capture.getByRole("button", { name: "保存到收件箱", exact: true }).click();
    await expect(capture).not.toBeVisible();
  }
  await page.goto("/inbox");
  await page.getByRole("button", { name: /打开任务.*收件预览甲/ }).click();
  await expect(page.locator(".inbox-preview-panel h2")).toHaveText("收件预览甲");
  await expect(page.locator(".task-drawer")).not.toBeVisible();
  await page.getByRole("button", { name: /打开任务.*收件预览乙/ }).click();
  await expect(page.locator(".inbox-preview-panel h2")).toHaveText("收件预览乙");
  await page.locator(".inbox-preview-panel").getByRole("button", { name: "移到待开始" }).click();
  await expect(page.locator(".inbox-preview-panel h2")).toHaveText("收件预览甲");
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    for (const theme of ["light", "dark"]) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        animations: "disabled",
        path: `docs/PRD/web/ui-qa/2026-09-08-redesign/audit-inbox-${theme}-${size.width}.png`,
      });
    }
  }
  await page.getByRole("button", { name: /打开任务.*收件预览甲/ }).click();
  await expect(page.locator(".task-drawer")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 480 });
  const settings = page.locator(".sidebar-settings");
  await expect(settings).toBeInViewport();
});
