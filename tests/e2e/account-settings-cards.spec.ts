import { expect, test } from "@playwright/test";
import { mockNetBirdApi } from "./helpers/mocks";

test.describe("Migrate page — account settings cards", () => {
  test("renders every account-settings card when source is fully populated", async ({
    page,
  }) => {
    await mockNetBirdApi(page, {
      resources: {
        account_settings: {
          peer_login_expiration_enabled: true,
          peer_login_expiration: 86400 * 7,
          peer_inactivity_expiration_enabled: false,
          peer_inactivity_expiration: 600,
          dns_domain: "netbird.cloud",
          network_range: "100.64.0.0/10",
          network_range_v6: "fd00::/8",
          ipv6_enabled_groups: ["src-grp-1"],
          routing_peer_dns_resolution_enabled: true,
          auto_update_version: "latest",
          auto_update_always: true,
          lazy_connection_enabled: false,
          groups_propagation_enabled: true,
          jwt_groups_enabled: true,
          jwt_groups_claim_name: "groups",
          jwt_allow_groups: ["src-grp-1", "src-grp-2"],
          peer_expose_enabled: true,
          peer_expose_groups: ["src-grp-2"],
          regular_users_view_blocked: false,
          local_mfa_enabled: true,
          extra: {
            peer_approval_enabled: true,
            user_approval_required: false,
            network_traffic_logs_enabled: true,
            network_traffic_logs_groups: ["src-grp-1"],
            network_traffic_packet_counter_enabled: false,
          },
        },
      },
    });

    await page.goto("/");

    const sourceCard = page.getByTestId("source-card");
    await sourceCard.locator('input[type="password"]').fill("src-tok-12345");
    await sourceCard.getByRole("button", { name: "Connect" }).click();
    await expect(sourceCard.getByText("Connected")).toBeVisible();

    const destCard = page.getByTestId("dest-card");
    await destCard.locator('input[type="password"]').fill("dest-tok-12345");
    await destCard
      .locator('input[type="url"]')
      .fill("https://dest.netbird.io/api");
    await destCard.getByRole("button", { name: "Connect" }).click();
    await expect(destCard.getByText("Connected")).toBeVisible();

    await page.getByRole("button", { name: /Next: Select Resources/i }).click();
    await expect(page).toHaveURL(/\/migrate$/);

    // The six account-settings cards should all be present.
    const heading = (name: RegExp) =>
      page.getByRole("heading", { name });
    await expect(heading(/^Authentication Settings/)).toBeVisible();
    await expect(heading(/^Network Settings/)).toBeVisible();
    await expect(heading(/^Client Settings/)).toBeVisible();
    await expect(heading(/^User Management/)).toBeVisible();
    await expect(heading(/^Peer Expose/)).toBeVisible();
    await expect(heading(/^Activity Logs/)).toBeVisible();

    // Spot-check entries within each new card.
    await expect(page.getByText("IPv6 Network Range")).toBeVisible();
    await expect(page.getByText("fd00::/8")).toBeVisible();
    await expect(page.getByText("IPv6 Enabled Groups")).toBeVisible();

    await expect(page.getByText("Background Auto-Update")).toBeVisible();

    await expect(page.getByText("JWT Group Sync")).toBeVisible();
    await expect(page.getByText("JWT Groups Claim Name")).toBeVisible();
    await expect(page.getByText("JWT Allow Groups")).toBeVisible();
    await expect(page.getByText("Local MFA (TOTP)")).toBeVisible();
    await expect(page.getByText("User Group Propagation")).toBeVisible();

    await expect(page.getByText("Peer Service Exposure")).toBeVisible();
    await expect(page.getByText("Peer Expose Groups")).toBeVisible();

    await expect(page.getByText("Network Traffic Logs")).toBeVisible();

    // Group ID subtitles must resolve to friendly names, not raw IDs.
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("src-grp-1");
    expect(body).not.toContain("src-grp-2");

    // Capture full-page screenshot for the audit record.
    await page.screenshot({
      path: "tests/e2e/screenshots/account-settings-cards.png",
      fullPage: true,
    });
  });

  test("hides each card when its underlying settings are absent", async ({
    page,
  }) => {
    // No account_settings at all — none of the cards should render.
    await mockNetBirdApi(page, {
      resources: {
        account_settings: undefined,
      },
    });

    await page.goto("/");
    const sourceCard = page.getByTestId("source-card");
    await sourceCard.locator('input[type="password"]').fill("src-tok-12345");
    await sourceCard.getByRole("button", { name: "Connect" }).click();
    await expect(sourceCard.getByText("Connected")).toBeVisible();

    const destCard = page.getByTestId("dest-card");
    await destCard.locator('input[type="password"]').fill("dest-tok-12345");
    await destCard
      .locator('input[type="url"]')
      .fill("https://dest.netbird.io/api");
    await destCard.getByRole("button", { name: "Connect" }).click();
    await expect(destCard.getByText("Connected")).toBeVisible();

    await page.getByRole("button", { name: /Next: Select Resources/i }).click();
    await expect(page).toHaveURL(/\/migrate$/);

    const heading = (name: RegExp) =>
      page.getByRole("heading", { name });
    await expect(heading(/^Authentication Settings/)).not.toBeVisible();
    await expect(heading(/^Network Settings/)).not.toBeVisible();
    await expect(heading(/^Client Settings/)).not.toBeVisible();
    await expect(heading(/^User Management/)).not.toBeVisible();
    await expect(heading(/^Peer Expose/)).not.toBeVisible();
    await expect(heading(/^Activity Logs/)).not.toBeVisible();
  });
});
