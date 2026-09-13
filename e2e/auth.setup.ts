import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

// Logt eenmalig in met de demo-credentials (voorgevuld in het formulier) en
// bewaart de sessie-cookie zodat alle tests ingelogd starten.
setup("authenticate", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await page.waitForURL("**/chef");
  await expect(page.getByText("Chef Auguste").first()).toBeVisible();
  await page.context().storageState({ path: authFile });
});
