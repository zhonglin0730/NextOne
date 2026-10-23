import { expect, test, type Page } from "@playwright/test";

async function openTaskFocus(page: Page) {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/projects");
  await page
    .getByRole("button", { name: /新建项目/ })
    .first()
    .click();
  const create = page.getByRole("dialog", { name: "新建项目" });
  await create.getByLabel("项目名称").fill("专注交互验收");
  await create.getByRole("button", { name: "新建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await page.getByRole("button", { name: "添加项目任务" }).click();
  const capture = page.getByRole("dialog", { name: "添加项目任务" });
  await capture.getByPlaceholder("记录一件事……").fill("精确计时与退出验收");
  await capture.getByRole("button", { name: "添加到项目" }).click();
  await page
    .locator(".board-column-ready")
    .getByRole("button", { name: "开始", exact: true })
    .click();
  await expect(page.locator(".board-column-doing")).toContainText("精确计时与退出验收");
  await page.goto("/today");
  await page.getByRole("button", { name: "专注", exact: true }).click();
  return page.locator(".zen-mode");
}

test("fractional pauses and exit cancellation preserve active time and audio state", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    Object.assign(window, { observedFocusAudio: contexts });
    const Original = AudioContext;
    window.AudioContext = class extends Original {
      constructor() {
        super();
        contexts.push(this);
      }
    };
  });
  await page.goto("/focus-preview.html");
  const zen = page.locator(".zen-mode");
  await zen.getByRole("button", { name: "开始专注", exact: true }).click();
  for (let index = 0; index < 4; index++) {
    await page.clock.runFor(350);
    await zen.getByRole("button", { name: "暂停计时", exact: true }).click();
    await page.clock.runFor(1000);
    await zen.getByRole("button", { name: "继续计时", exact: true }).click();
  }
  await expect(zen.getByRole("timer")).toHaveText("24:59");
  await zen.getByRole("button", { name: "暂停计时", exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(zen.getByRole("timer")).toHaveText("24:59");
  for (const name of ["雨声", "海浪", "林风", "林风"])
    await zen.getByRole("button", { name, exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { observedFocusAudio: AudioContext[] }).observedFocusAudio.length,
    ),
  ).toBe(0);
  await zen.getByRole("button", { name: "退出专注", exact: true }).click();
  const prompt = page.getByRole("alertdialog");
  await expect(prompt).toContainText("本轮不足一分钟");
  await expect(prompt.getByRole("button", { name: "返回专注" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(prompt).not.toBeVisible();
  await expect(zen.getByRole("button", { name: "继续计时", exact: true })).toBeVisible();
  await zen.getByRole("button", { name: "继续计时", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { observedFocusAudio: AudioContext[] }).observedFocusAudio[0]
            ?.state,
      ),
    )
    .toBe("running");
  await zen.getByRole("button", { name: "退出专注", exact: true }).click();
  await page.clock.runFor(10_000);
  await expect(zen.getByRole("timer", { includeHidden: true })).toHaveText("24:59");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { observedFocusAudio: AudioContext[] }).observedFocusAudio[0]
            ?.state,
      ),
    )
    .toBe("suspended");
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    await page.screenshot({
      path: `docs/PRD/web/ui-qa/2026-10-23-tide/audit-exit-${size.width}x${size.height}.png`,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await prompt.getByRole("button", { name: "返回专注" }).click();
  await page.clock.runFor(1100);
  await expect(zen.getByRole("timer")).toHaveText("24:58");
  await zen.getByRole("button", { name: "退出专注", exact: true }).click();
  await prompt.getByRole("button", { name: "退出专注", exact: true }).click();
  await expect(zen).not.toBeVisible();
  await page.clock.runFor(500);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { observedFocusAudio: AudioContext[] }).observedFocusAudio[0]
            ?.state,
      ),
    )
    .toBe("closed");
});

test("failed exit save retries the same snapshot once and returns to today", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.clock.install();
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.add;
    let fail = true;
    IDBObjectStore.prototype.add = function (value, key) {
      if (value?.type === "FOCUS_SESSION_COMPLETED" && fail) {
        fail = false;
        throw new DOMException("QA focus write failure", "QuotaExceededError");
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  const zen = await openTaskFocus(page);
  await zen.getByRole("button", { name: "开始专注", exact: true }).click();
  await page.clock.fastForward(65_000);
  await zen.getByRole("button", { name: "退出专注", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toContainText("约 1 分钟");
  await page.clock.fastForward(300_000);
  await page.getByRole("button", { name: "保存并退出", exact: true }).click();
  await expect(zen.getByRole("alert")).toContainText("专注时间尚未保存");
  await expect(zen.getByRole("button", { name: "继续计时", exact: true })).toBeDisabled();
  await zen.getByRole("button", { name: "重新保存", exact: true }).dblclick();
  await expect(zen).not.toBeVisible();
  await expect(page.locator(".today-task-card")).toContainText("已专注 1 次 · 1 分钟");
  await expect(page.locator(".today-task-card .status-badge")).toHaveText("进行中");
  expect(pageErrors).toEqual([]);
});

test("a completed timer saves once and task transition errors stay visible", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.clock.install();
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if (value?.status === "COMPLETED" && value?.title === "精确计时与退出验收" && fail) {
        fail = false;
        throw new DOMException("QA status failure", "UnknownError");
      }
      return key === undefined ? original.call(this, value) : original.call(this, value, key);
    };
  });
  const zen = await openTaskFocus(page);
  await zen.getByRole("button", { name: "开始专注", exact: true }).click();
  await page.clock.fastForward(30 * 60_000);
  await expect(zen).toContainText("已记录 25 分钟专注");
  await zen.locator(".zen-details > summary").click();
  await zen.getByRole("button", { name: "完成任务", exact: true }).click();
  await expect(zen.getByRole("alert")).toContainText("状态没有改变");
  await zen.getByRole("button", { name: "完成任务", exact: true }).click();
  await expect(zen).not.toBeVisible();
  await page.goto("/board");
  await page.getByRole("button", { name: "精确计时与退出验收", exact: true }).click();
  await expect(page.locator(".task-drawer .task-focus-summary")).toContainText(
    "已专注 1 次 · 25 分钟",
  );
  expect(pageErrors).toEqual([]);
});
