import { expect, test } from "@playwright/test";

const webUrl = process.env.NEXTONE_E2E_SYNC_WEB_URL ?? "http://127.0.0.1:5173";
const apiUrl = process.env.NEXTONE_E2E_SYNC_API_URL ?? "http://127.0.0.1:8080";
const accessToken = process.env.NEXTONE_E2E_SYNC_TOKEN ?? "nextone-local-dev-token";
const syncEnabled = process.env.NEXTONE_E2E_SYNC === "1";

interface ServerTask {
  id: string;
  revision: number;
  title: string;
}

test("a task captured in one browser appears in another browser", async ({ browser, request }) => {
  test.skip(!syncEnabled, "Set NEXTONE_E2E_SYNC=1 when the local API and PostgreSQL are running");

  const taskTitle = `E2E cross-browser sync ${Date.now()}`;
  const authorization = { Authorization: `Bearer ${accessToken}` };
  const firstBrowser = await browser.newContext();
  const secondBrowser = await browser.newContext();
  let serverTask: ServerTask | undefined;

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
        const response = await request.get(`${apiUrl}/api/v1/bootstrap`, {
          headers: authorization,
        });
        expect(response.ok()).toBe(true);
        const snapshot = (await response.json()) as { tasks: ServerTask[] };
        serverTask = snapshot.tasks.find((task) => task.title === taskTitle);
        return serverTask !== undefined;
      })
      .toBe(true);

    const secondPage = await secondBrowser.newPage();
    await secondPage.goto(`${webUrl}/inbox`);
    await expect(secondPage.locator(".sync-status-up_to_date")).toBeVisible();
    await expect(secondPage.locator(".task-row").filter({ hasText: taskTitle })).toBeVisible();
  } finally {
    await Promise.all([firstBrowser.close(), secondBrowser.close()]);
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
    }
  }
});
