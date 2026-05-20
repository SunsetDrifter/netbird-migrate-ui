import { expect, test } from "@playwright/test";
import { mockNetBirdApi } from "./helpers/mocks";

test.describe("Offline workflow card", () => {
  test("buttons are disabled with explanatory text before either side connects", async ({
    page,
  }) => {
    await mockNetBirdApi(page);
    await page.goto("/");

    const offlineCard = page
      .locator("div")
      .filter({ hasText: /Offline workflow/ })
      .first();

    const exportBtn = offlineCard.getByRole("button", {
      name: /Fetch & Export/i,
    });
    const importBtn = offlineCard.getByRole("button", {
      name: /Import Config/i,
    });

    await expect(exportBtn).toBeDisabled();
    await expect(importBtn).toBeDisabled();
    await expect(
      offlineCard.getByText(/Connect the source instance first/i)
    ).toBeVisible();
    await expect(
      offlineCard.getByText(/Connect the destination instance first/i)
    ).toBeVisible();
  });

  test("Fetch & Export enables once source is connected", async ({ page }) => {
    await mockNetBirdApi(page);
    await page.goto("/");

    const sourceCard = page.getByTestId("source-card");
    await sourceCard.locator('input[type="password"]').fill("src-tok-12345");
    await sourceCard.getByRole("button", { name: "Connect" }).click();
    await expect(sourceCard.getByText("Connected")).toBeVisible();

    const offlineCard = page
      .locator("div")
      .filter({ hasText: /Offline workflow/ })
      .first();
    await expect(
      offlineCard.getByRole("button", { name: /Fetch & Export/i })
    ).toBeEnabled();
    await expect(
      offlineCard.getByText(/Downloads source config as JSON/i)
    ).toBeVisible();
  });
});
