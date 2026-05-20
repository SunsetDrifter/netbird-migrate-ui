import { expect, test } from "@playwright/test";
import { mockNetBirdApi } from "./helpers/mocks";

test.describe("Online migration runs to completion", () => {
  test("clicks Start Migration, streams SSE events, and shows the summary", async ({
    page,
  }) => {
    await mockNetBirdApi(page);
    await page.goto("/");

    // Connect source
    const sourceCard = page.getByTestId("source-card");
    await sourceCard.locator('input[type="password"]').fill("src-tok-12345");
    await sourceCard.getByRole("button", { name: "Connect" }).click();
    await expect(sourceCard.getByText("Connected")).toBeVisible();

    // Connect destination
    const destCard = page.getByTestId("dest-card");
    await destCard.locator('input[type="password"]').fill("dest-tok-12345");
    await destCard
      .locator('input[type="url"]')
      .fill("https://dest.netbird.io/api");
    await destCard.getByRole("button", { name: "Connect" }).click();
    await expect(destCard.getByText("Connected")).toBeVisible();

    // Wizard step 2: Select Resources
    await page.getByRole("button", { name: /Next: Select Resources/i }).click();
    await expect(page).toHaveURL(/\/migrate$/);

    // Wizard step 3: Execute
    await page.getByRole("button", { name: /Next: Migrate/i }).click();
    await expect(page).toHaveURL(/\/migrate\/execute$/);

    // After conflict detection (none — destination is empty), Start button shows
    await expect(
      page.getByRole("button", { name: /Start Migration/i })
    ).toBeVisible();
    await page.getByRole("button", { name: /Start Migration/i }).click();

    // Progress log renders streamed events
    await expect(page.getByText(/Created group: IT Admins/)).toBeVisible();
    await expect(page.getByText(/Created group: Developers/)).toBeVisible();
    await expect(
      page.getByText(/Created posture check: macOS only/)
    ).toBeVisible();
    await expect(page.getByText(/Created policy: Default/)).toBeVisible();
    await expect(
      page.getByText(/Created network: Office Network/)
    ).toBeVisible();

    // Summary card with the totals from the mocked complete event
    await expect(
      page.getByRole("heading", { name: /Migration Complete/i })
    ).toBeVisible();
    // The summary labels render as standalone <p>Created</p>, <p>Skipped</p>,
    // <p>Failed</p>. Use exact-match so they don't collide with progress log
    // entries like "Created group: IT Admins".
    await expect(page.getByText("Created", { exact: true })).toBeVisible();
    await expect(page.getByText("Skipped", { exact: true })).toBeVisible();
    await expect(page.getByText("Failed", { exact: true })).toBeVisible();
    // The "5" created count is rendered as a large bold number in the summary.
    await expect(page.getByText("5", { exact: true })).toBeVisible();

    // Final CTA appears
    await expect(
      page.getByRole("button", { name: /Start New Migration/i })
    ).toBeVisible();
  });
});
