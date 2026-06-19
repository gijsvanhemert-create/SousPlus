import { test, expect } from "@playwright/test";

// E2e over de volledige demoflows. Serieel (workers: 1); de Waakhond-flow draait
// als laatste omdat die prijzen muteert (en daarna herstelt).

test("alle modules renderen voor een ingelogde chef", async ({ page }) => {
  const checks: [string, RegExp | string][] = [
    ["/chef", "Chef Auguste"],
    ["/lab", "Mise en place"],
    ["/flavor", /Curated culinary intelligence/],
    ["/ingredients", /Hanos/],
    ["/library", /Open in Lab/],
    ["/matrix", "STERREN"],
    ["/supplier", /Force Live API Re-Sync/],
    ["/ocr", /Scan factuur/],
    ["/haccp", /Audit-logboek/],
  ];
  for (const [path, needle] of checks) {
    await page.goto(path);
    await expect(page.getByText(needle).first()).toBeVisible();
  }
});

test("catalogus: zoeken filtert de artikelen", async ({ page }) => {
  await page.goto("/ingredients");
  await page.getByPlaceholder(/Zoek een artikel/).fill("miso");
  await expect(page.getByText(/resultaten/).first()).toBeVisible();
  await expect(page.getByText(/miso/i).first()).toBeVisible();
});

test("library: een kaart opent het recept in de Lab (deep-link)", async ({ page }) => {
  await page.goto("/library");
  await page.getByText("Miso-Glazed Salmon").first().click();
  await page.waitForURL(/\/lab\?recipe=/);
  await expect(page.getByText("Mise en place")).toBeVisible();
});

test("Recipe Lab: hoeveelheid aanpassen herberekent de marge live", async ({ page }) => {
  await page.goto("/lab");
  // Kies expliciet de Miso-Glazed Salmon (na reseed zijn er meerdere favorieten).
  await page.getByLabel("Kies gerecht").selectOption({ label: "Miso-Glazed Salmon" });

  const margin = page.getByTestId("lab-margin");
  await expect(margin).toBeVisible();
  const before = (await margin.textContent())?.trim();

  const amount = page.getByLabel("hoeveelheid Zalmfilet");
  const original = await amount.inputValue();
  await amount.fill("400");
  await amount.press("Enter");

  await expect(margin).not.toHaveText(before ?? "");

  // Herstel de oorspronkelijke hoeveelheid.
  await amount.fill(original);
  await amount.press("Enter");
});

test("Chef Auguste: tool-use opent een module (navigate)", async ({ page }) => {
  await page.goto("/chef");
  const input = page.getByPlaceholder(/Geef Chef Auguste een opdracht/);
  await expect(input).toBeEnabled();
  await input.fill("Open de Recipe Lab");
  await page.getByRole("button", { name: "Versturen" }).click();
  await page.waitForURL("**/lab", { timeout: 20_000 });
});

test("Chef Auguste: margeanalyse geeft een onderbouwd antwoord", async ({ page }) => {
  await page.goto("/chef");
  const input = page.getByPlaceholder(/Geef Chef Auguste een opdracht/);
  await input.fill("Analyseer de marge van het voorjaarsmenu.");
  await page.getByRole("button", { name: "Versturen" }).click();
  await expect(page.getByText(/onder druk/i).first()).toBeVisible({ timeout: 20_000 });
});

test("OCR: voorbeeldfactuur scannen levert gekoppelde regels", async ({ page }) => {
  await page.goto("/ocr");
  await page.getByRole("button", { name: "Voorbeeld" }).click();
  await page.getByRole("button", { name: "Scan factuur" }).click();
  await expect(page.getByText(/regels herkend/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Zalmfilet vers").first()).toBeVisible();
});

test("HACCP: een meting vastleggen verschijnt in de audit trail", async ({ page }) => {
  await page.goto("/haccp");
  await page.getByLabel(/^meting/).first().fill("3");
  await page.getByRole("button", { name: "Vastleggen" }).first().click();
  await expect(page.getByText("Keten geverifieerd").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("3.00").first()).toBeVisible();
});

test("Marge-Waakhond: re-sync triggert een alert en herstelt via leverancier wisselen", async ({ page }) => {
  await page.goto("/supplier");
  await page.getByRole("button", { name: "Force Live API Re-Sync" }).click();

  // De bel toont na de prijscascade (boter +14%) een waarschuwing.
  const bell = page.getByRole("button", { name: "Marge-Waakhond" });
  await expect(bell).toContainText("1", { timeout: 30_000 });

  await bell.click();
  await expect(page.getByText(/onder de kritieke grens/)).toBeVisible();
  await page.getByRole("button", { name: "Wissel leverancier" }).click();

  // Na herstel is er geen actieve waarschuwing meer.
  await expect(page.getByText(/Geen actieve waarschuwingen/)).toBeVisible({ timeout: 15_000 });
});
