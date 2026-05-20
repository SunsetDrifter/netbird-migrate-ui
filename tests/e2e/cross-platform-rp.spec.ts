import { expect, test } from "@playwright/test";
import { mockNetBirdApi } from "./helpers/mocks";

test.describe("Cross-platform Reverse Proxy is excluded", () => {
  test("hides Reverse Proxy cards and shows the explainer banner when CE → cloud", async ({
    page,
  }) => {
    await mockNetBirdApi(page, {
      resources: {
        reverse_proxy_domains: [
          {
            id: "rpd-1",
            domain: "api.example.com",
            validated: true,
          },
        ],
      },
    });

    await page.goto("/");

    // Source = self-hosted CE
    const sourceCard = page.getByTestId("source-card");
    await sourceCard.locator('input[type="password"]').fill("src-tok-12345");
    await sourceCard
      .locator('input[type="url"]')
      .fill("https://community.example.org/api");
    await sourceCard.getByRole("button", { name: "Connect" }).click();
    await expect(sourceCard.getByText("Connected")).toBeVisible();

    // Destination = cloud
    const destCard = page.getByTestId("dest-card");
    await destCard.locator('input[type="password"]').fill("dest-tok-12345");
    // (default URL is already api.netbird.io/api)
    await destCard.getByRole("button", { name: "Connect" }).click();
    await expect(destCard.getByText("Connected")).toBeVisible();

    await page.getByRole("button", { name: /Next: Select Resources/i }).click();
    await expect(page).toHaveURL(/\/migrate$/);

    // The "Reverse Proxy not migrated" explainer is shown
    await expect(
      page.getByText(/Reverse Proxy not migrated/i)
    ).toBeVisible();

    // And the actual Reverse Proxy ResourceList cards are NOT
    await expect(
      page.getByRole("heading", { name: /Reverse Proxy Domains/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: /Reverse Proxy Services/i })
    ).toHaveCount(0);
  });
});
