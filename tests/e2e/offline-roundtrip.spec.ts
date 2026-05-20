import { expect, test } from "@playwright/test";
import { mockNetBirdApi } from "./helpers/mocks";

test.describe("Offline export → import round-trip", () => {
  test("Fetch & Export downloads a JSON config that Import Config accepts", async ({
    page,
  }) => {
    await mockNetBirdApi(page);
    await page.goto("/");

    // Connect source to enable export
    const sourceCard = page.getByTestId("source-card");
    await sourceCard.locator('input[type="password"]').fill("src-tok-12345");
    await sourceCard.getByRole("button", { name: "Connect" }).click();
    await expect(sourceCard.getByText("Connected")).toBeVisible();

    // Trigger export — Playwright captures the download
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Fetch & Export/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("netbird-migration-config.json");

    // Save the download under a real .json filename — the import modal's
    // drag/drop handler requires the file basename to end in ".json", and
    // Playwright's default download.path() is an extensionless tempfile.
    const path = await import("node:path");
    const os = await import("node:os");
    const fs = await import("node:fs/promises");
    const downloadPath = path.join(
      os.tmpdir(),
      `netbird-migration-config-${Date.now()}.json`
    );
    await download.saveAs(downloadPath);
    const exportedRaw = await fs.readFile(downloadPath, "utf8");
    const exported = JSON.parse(exportedRaw);
    expect(exported.version).toBe(1);
    expect(exported.sourceUrl).toBeTruthy();
    expect(exported.resources).toBeTruthy();
    expect(Array.isArray(exported.resources.groups)).toBe(true);
    expect(exported.selection).toBeTruthy();

    // Now exercise the import side: connect a destination, open Import Config,
    // upload that JSON, and verify the wizard moves on to /migrate.
    const destCard = page.getByTestId("dest-card");
    await destCard.locator('input[type="password"]').fill("dest-tok-12345");
    await destCard
      .locator('input[type="url"]')
      .fill("https://dest.netbird.io/api");
    await destCard.getByRole("button", { name: "Connect" }).click();
    await expect(destCard.getByText("Connected")).toBeVisible();

    await page.getByRole("button", { name: /Import Config/i }).click();

    // Wait for the modal heading to confirm it opened.
    await expect(
      page.getByRole("heading", { name: /Import Configuration/i })
    ).toBeVisible();

    // Use the file chooser pattern: click "Browse Files" and provide the file.
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /Browse Files/i }).click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(downloadPath);

    // Confirm the modal parsed the file and advanced to the validate step.
    await expect(page.getByText(/Config file parsed successfully/i)).toBeVisible({
      timeout: 5000,
    });

    // Modal advances: validate → preview → apply. With the destination
    // connected the validate step's primary button is "Preview"; on
    // subsequent steps it's "Continue".
    for (const label of ["Preview", "Continue", "Continue"]) {
      const btn = page.getByRole("button", { name: label, exact: true });
      await btn.waitFor({ state: "visible", timeout: 5000 });
      await btn.click();
    }

    // handleApply calls onImport and onClose, which sets importApplied=true
    // on the home page → green banner becomes visible.
    await expect(
      page.getByText(/Configuration imported successfully/i)
    ).toBeVisible({ timeout: 5000 });
  });
});
