import { expect, test } from "@playwright/test";

const webUrl = process.env.NEXTONE_E2E_SYNC_WEB_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.NEXTONE_E2E_SYNC_API_URL ?? "http://127.0.0.1:8080";
const accessToken = process.env.NEXTONE_E2E_SYNC_TOKEN ?? "nextone-local-dev-token";
const syncEnabled = process.env.NEXTONE_E2E_SYNC === "1";

interface ServerTask {
  id: string;
  revision: number;
  title: string;
  resumeNote?: string;
  resumeNoteUpdatedAt?: string;
}

test("task capture and continuation note edits and clearing sync between browsers", async ({
  browser,
  request,
}) => {
  test.skip(!syncEnabled, "Set NEXTONE_E2E_SYNC=1 when the local API and PostgreSQL are running");
  test.setTimeout(90_000);

  const taskTitle = `E2E cross-browser sync ${Date.now()}`;
  const authorization = { Authorization: `Bearer ${accessToken}` };
  const firstBrowser = await browser.newContext();
  const secondBrowser = await browser.newContext();
  let serverTask: ServerTask | undefined;
  const readServerTask = async () => {
    const response = await request.get(`${apiUrl}/api/v1/bootstrap`, { headers: authorization });
    expect(response.ok()).toBe(true);
    const snapshot = (await response.json()) as { tasks: ServerTask[] };
    serverTask = snapshot.tasks.find((task) => task.title === taskTitle);
    return serverTask;
  };

  try {
    const firstPage = await firstBrowser.newPage();
    await firstPage.goto(`${webUrl}/projects`);
    await expect(firstPage.locator(".sync-status-up_to_date")).toBeVisible();

    await firstPage.locator(".capture-button").click();
    const captureDialog = firstPage.locator(".capture-dialog");
    await captureDialog.locator(".capture-title-input").fill(taskTitle);
    await captureDialog.locator(".dialog-actions .button-primary").click();

    await expect
      .poll(async () => {
        return (await readServerTask()) !== undefined;
      })
      .toBe(true);

    const secondPage = await secondBrowser.newPage();
    await secondPage.goto(`${webUrl}/inbox`);
    await expect(secondPage.locator(".sync-status-up_to_date")).toBeVisible();
    await expect(secondPage.locator(".task-row").filter({ hasText: taskTitle })).toBeVisible();

    await firstPage.goto(`${webUrl}/inbox`);
    await firstPage
      .locator(".task-row")
      .filter({ hasText: taskTitle })
      .locator(".task-row-main")
      .click();
    await firstPage.getByRole("button", { name: "留一句下次继续点" }).click();
    const firstEditor = firstPage.getByRole("dialog", { name: "留给下次的自己" });
    await firstEditor.getByLabel("下次从哪里继续（选填）").fill("浏览器 A：下次补接口测试");
    await firstEditor.getByRole("button", { name: "保存继续点" }).click();
    await expect(firstEditor).not.toBeVisible();
    await expect
      .poll(async () => (await readServerTask())?.resumeNote)
      .toBe("浏览器 A：下次补接口测试");
    expect(serverTask?.resumeNoteUpdatedAt).toBeTruthy();

    // Keep B open: its periodic sync must pull A's note without a manual page reload.
    await secondPage.waitForResponse(
      async (response) => {
        if (response.url() !== `${apiUrl}/api/v1/bootstrap` || !response.ok()) return false;
        const snapshot = (await response.json()) as { tasks: ServerTask[] };
        return snapshot.tasks.some(
          (task) => task.title === taskTitle && task.resumeNote === "浏览器 A：下次补接口测试",
        );
      },
      { timeout: 40_000 },
    );
    await expect(secondPage.locator(".sync-status-up_to_date")).toBeVisible();
    await secondPage
      .locator(".task-row")
      .filter({ hasText: taskTitle })
      .locator(".task-row-main")
      .click();
    await expect(secondPage.locator(".task-drawer .resume-note")).toContainText(
      "浏览器 A：下次补接口测试",
    );
    await secondPage.getByRole("button", { name: "修改继续点" }).click();
    const secondEditor = secondPage.getByRole("dialog", { name: "留给下次的自己" });
    await secondEditor.getByLabel("下次从哪里继续（选填）").fill("浏览器 B：先处理失败重试");
    await secondEditor.getByRole("button", { name: "保存继续点" }).click();
    await expect(secondEditor).not.toBeVisible();
    await expect
      .poll(async () => (await readServerTask())?.resumeNote)
      .toBe("浏览器 B：先处理失败重试");

    await firstPage.reload();
    await expect(firstPage.locator(".sync-status-up_to_date")).toBeVisible();
    await firstPage
      .locator(".task-row")
      .filter({ hasText: taskTitle })
      .locator(".task-row-main")
      .click();
    await expect(firstPage.locator(".task-drawer .resume-note")).toContainText(
      "浏览器 B：先处理失败重试",
    );
    await firstPage.getByRole("button", { name: "修改继续点" }).click();
    await firstEditor.getByLabel("下次从哪里继续（选填）").fill("");
    await firstEditor.getByRole("button", { name: "保存继续点" }).click();
    await expect(firstEditor).not.toBeVisible();
    await expect.poll(async () => (await readServerTask())?.resumeNote).toBe("");
    expect(serverTask?.resumeNoteUpdatedAt).toBeTruthy();

    await secondPage.reload();
    await expect(secondPage.locator(".sync-status-up_to_date")).toBeVisible();
    await secondPage
      .locator(".task-row")
      .filter({ hasText: taskTitle })
      .locator(".task-row-main")
      .click();
    await expect(secondPage.getByRole("button", { name: "留一句下次继续点" })).toBeVisible();
    await expect(secondPage.locator(".task-drawer .resume-note p")).toHaveCount(0);
  } finally {
    await Promise.all([firstBrowser.close(), secondBrowser.close()]);
    // Fetch the latest revision even when an assertion fails midway through editing.
    await readServerTask();
    if (serverTask !== undefined) {
      const response = await request.post(`${apiUrl}/api/v1/sync/push`, {
        data: {
          deviceId: "playwright-cleanup",
          mutations: [
            {
              clientMutationId: crypto.randomUUID(),
              entityType: "TASK",
              entityId: serverTask.id,
              operation: "DELETE",
              baseRevision: serverTask.revision,
              occurredAt: new Date().toISOString(),
              payload: null,
            },
          ],
        },
        headers: authorization,
      });
      expect(response.ok()).toBe(true);
      const result = (await response.json()) as { results: { status: string }[] };
      expect(result.results).toHaveLength(1);
      expect(result.results[0]?.status).toBe("APPLIED");
      expect(await readServerTask()).toBeUndefined();
    }
  }
});
