import { expect, test } from "@playwright/test";

test("task focus preserves the execution flow at desktop and mobile sizes", async ({ page }) => {
  await page.addInitScript(() => {
    const contexts: AudioContext[] = [];
    Object.assign(window, { focusAudioContexts: contexts });
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }
    };
  });
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/projects");
  await page
    .getByRole("button", { name: /新建项目/ })
    .first()
    .click();
  const create = page.getByRole("dialog", { name: "新建项目" });
  await create.getByLabel("项目名称").fill("NextOne 体验升级");
  await create.getByRole("button", { name: "新建项目", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await page.getByRole("button", { name: "添加项目任务" }).click();
  const capture = page.getByRole("dialog", { name: "添加项目任务" });
  await capture.getByPlaceholder("记录一件事……").fill("梳理下一版的核心流程");
  await capture.getByRole("button", { name: "添加到项目" }).click();
  await page
    .locator(".board-column-ready")
    .getByRole("button", { name: "开始", exact: true })
    .click();
  await page.goto("/today");
  await page.getByRole("button", { name: "专注", exact: true }).click();
  const zen = page.locator(".zen-mode");
  await expect(zen).toBeVisible();
  await expect(zen.locator(".zen-project")).toContainText("NextOne 体验升级");
  await expect(zen.getByRole("button", { name: "关闭", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { focusAudioContexts: AudioContext[] }).focusAudioContexts.length,
    ),
  ).toBe(0);
  for (const size of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: `docs/PRD/web/ui-qa/2026-10-23-tide/after-setup-${size.width}x${size.height}.png`,
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await zen.getByRole("button", { name: "雨声", exact: true }).click();
  await expect(zen.getByRole("button", { name: "雨声", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { focusAudioContexts: AudioContext[] }).focusAudioContexts[0]
            ?.state,
      ),
    )
    .toBe("running");
  await zen.getByRole("button", { name: "海浪", exact: true }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { focusAudioContexts: AudioContext[] }).focusAudioContexts.length,
    ),
  ).toBe(1);
  await zen.getByRole("slider", { name: "音量" }).fill("0.2");
  await zen.getByRole("button", { name: "开始专注", exact: true }).click();
  await expect(zen.getByRole("timer")).toBeVisible();
  await zen.getByRole("button", { name: "暂停计时", exact: true }).click();
  await expect(zen).toContainText("开始或继续计时后播放");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { focusAudioContexts: AudioContext[] }).focusAudioContexts[0]
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
      path: `docs/PRD/web/ui-qa/2026-10-23-tide/after-focus-${size.width}x${size.height}.png`,
    });
  }
  await zen.getByRole("button", { name: "继续计时", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { focusAudioContexts: AudioContext[] }).focusAudioContexts[0]
            ?.state,
      ),
    )
    .toBe("running");
  await zen.getByRole("button", { name: "关闭", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { focusAudioContexts: AudioContext[] }).focusAudioContexts[0]
            ?.state,
      ),
    )
    .toBe("suspended");
  await page.clock.install();
  await page.clock.fastForward(65_000);
  await expect(zen.getByRole("timer")).toContainText("23:");
  await zen.getByRole("button", { name: "结束本次专注", exact: true }).click();
  await expect(zen).toContainText("已记录 1 分钟专注");
  await page.screenshot({ path: "docs/PRD/web/ui-qa/2026-10-23-tide/after-recovery-390x844.png" });
  await zen.getByRole("button", { name: "开始 5 分钟休息", exact: true }).click();
  await expect(zen.getByRole("timer")).toHaveText("05:00");
  await zen.getByRole("button", { name: "暂不休息", exact: true }).click();
  await zen.locator(".zen-details > summary").click();
  await expect(zen.getByRole("button", { name: "完成任务", exact: true })).toBeVisible();
  await expect(zen.getByRole("button", { name: "暂停任务并留在今天" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(zen).not.toBeVisible();
  await page.clock.runFor(500);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { focusAudioContexts: AudioContext[] }).focusAudioContexts[0]
            ?.state,
      ),
    )
    .toBe("closed");
  await expect(page.locator(".today-task-card .status-badge")).toHaveText("进行中");
  await expect(page.locator(".today-task-card")).toContainText("1 分钟");
});
