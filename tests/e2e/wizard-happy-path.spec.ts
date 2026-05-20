import { expect, test } from "@playwright/test";
import { mockNetBirdApi } from "./helpers/mocks";

test.describe("Connect → Select → Migrate happy path", () => {
  test("walks the full wizard with mocked API", async ({ page }) => {
    await mockNetBirdApi(page);
    await page.goto("/");

    // Top-of-page instruction is visible.
    await expect(
      page.getByText(/How to migrate your NetBird configuration/i)
    ).toBeVisible();

    // Source card — connect
    const sourceCard = page.getByTestId("source-card");
    await sourceCard.locator('input[type="password"]').fill("src-tok-12345");
    await sourceCard.getByRole("button", { name: "Connect" }).click();
    await expect(sourceCard.getByText("Connected")).toBeVisible();

    // Destination card — connect (use a distinct URL so UI guard passes)
    const destCard = page.getByTestId("dest-card");
    await destCard.locator('input[type="password"]').fill("dest-tok-12345");
    await destCard
      .locator('input[type="url"]')
      .fill("https://dest.netbird.io/api");
    await destCard.getByRole("button", { name: "Connect" }).click();
    await expect(destCard.getByText("Connected")).toBeVisible();

    // Proceed to selection
    await page.getByRole("button", { name: /Next: Select Resources/i }).click();
    await expect(page).toHaveURL(/\/migrate$/);

    // Resource lists are rendered
    await expect(page.getByText(/Groups/).first()).toBeVisible();
    await expect(page.getByText(/Policies/).first()).toBeVisible();
    await expect(page.getByText(/Networks/).first()).toBeVisible();

    // Proceed to execute
    await page.getByRole("button", { name: /Next: Migrate/i }).click();
    await expect(page).toHaveURL(/\/migrate\/execute$/);
  });
});
