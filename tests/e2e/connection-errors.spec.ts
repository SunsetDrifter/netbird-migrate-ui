import { expect, test } from "@playwright/test";
import { mockNetBirdApi } from "./helpers/mocks";

test.describe("Connection failures surface to the user", () => {
  test("shows the server error when the source connection is rejected", async ({
    page,
  }) => {
    await mockNetBirdApi(page, {
      connectStatus: 401,
      connectError: "Authentication failed",
    });
    await page.goto("/");

    const sourceCard = page.getByTestId("source-card");
    await sourceCard.locator('input[type="password"]').fill("bad-token");
    await sourceCard.getByRole("button", { name: "Connect" }).click();

    await expect(sourceCard.getByText(/Authentication failed/i)).toBeVisible();
    // Card stays in disconnected state
    await expect(sourceCard.getByText("Connected")).toHaveCount(0);
  });
});
