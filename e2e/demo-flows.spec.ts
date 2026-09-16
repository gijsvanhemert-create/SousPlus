import { test, expect } from "@playwright/test";
import { buildInvoicePdf } from "./fixtures/invoice-pdf";
import { SAMPLE_INVOICE_TEXT } from "../src/lib/ocr-sample";

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
    ["/supplier", /Actuele inkoopprijzen/],
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

test("OCR: factuur-upload scannen levert gekoppelde regels", async ({ page }) => {
  await page.goto("/ocr");
  // Upload een échte, leesbare PDF met de voorbeeldfactuur, zodat de test werkt
  // met zowel de mock als het echte vision-model. De Scan-knop is uitgeschakeld
  // tot het bestand verwerkt is; Playwright wacht automatisch tot hij klikbaar is.
  await page.setInputFiles('[data-testid="ocr-file-input"]', {
    name: "factuur.pdf",
    mimeType: "application/pdf",
    buffer: buildInvoicePdf(SAMPLE_INVOICE_TEXT),
  });
  await page.getByRole("button", { name: "Scan factuur" }).click();
  await expect(page.getByText(/regels herkend/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/zalmfilet/i).first()).toBeVisible();

  // Fase 3 — inline-correctie: prijs bewerken en een regel uitsluiten vóór
  // toepassen. We passen niets echt toe (geen DB-mutatie); we controleren dat de
  // correctie-UI de toepassen-teller aanstuurt.
  const priceField = page.locator('input[aria-label^="prijs "]').first();
  await expect(priceField).toBeVisible();
  await priceField.fill("99,99");
  await expect(priceField).toHaveValue("99,99");

  const applyCount = async () => {
    const label = (await page.getByRole("button", { name: /voorraadprijzen bij/ }).textContent()) ?? "";
    return Number(label.match(/Werk\s+(\d+)/)?.[1] ?? "0");
  };
  const before = await applyCount();
  expect(before).toBeGreaterThan(0);
  await page.locator('input[type="checkbox"][aria-label$=" bijwerken"]').first().uncheck();
  expect(await applyCount()).toBe(before - 1);
});

// Een fictief artikel dat niet in de catalogus zit (en geen specifiek token deelt
// met bestaande artikelen), zodat de regel gegarandeerd niet-gekoppeld is.
const ADD_INVOICE_TEXT =
  "GROOTHANDEL EXOTICA B.V. — Factuur TEST-ADD-001\n" +
  "------------------------------------------------\n" +
  "Artikel                          Aantal   Prijs    Totaal\n" +
  "Drakenfruit exotisch              3,0 kg   18,75    56,25";

test("OCR: niet-gekoppelde regel toevoegen aan catalogus", async ({ page }) => {
  await page.goto("/ocr");
  await page.setInputFiles('[data-testid="ocr-file-input"]', {
    name: "exotica.pdf",
    mimeType: "application/pdf",
    buffer: buildInvoicePdf(ADD_INVOICE_TEXT),
  });
  await page.getByRole("button", { name: "Scan factuur" }).click();
  await expect(page.getByText(/regels herkend/)).toBeVisible({ timeout: 30_000 });

  // Open het toevoeg-formulier van de (niet-gekoppelde) regel.
  await page.getByRole("button", { name: /drakenfruit.*toevoegen aan catalogus/i }).first().click();

  // Formulier met categorie-keuze verschijnt; kies "Overig" en voeg toe.
  await expect(page.getByLabel("categorie nieuw artikel")).toBeVisible();
  await page.getByLabel("categorie nieuw artikel").selectOption("Overig");
  await page.getByRole("button", { name: "Toevoegen aan catalogus", exact: true }).click();

  await expect(page.getByText(/toegevoegd aan catalogus/)).toBeVisible({ timeout: 15_000 });
});

test("HACCP: een meting vastleggen verschijnt in de audit trail", async ({ page }) => {
  await page.goto("/haccp");
  await page.getByLabel(/^meting/).first().fill("3");
  await page.getByRole("button", { name: "Vastleggen" }).first().click();
  await expect(page.getByText("Keten geverifieerd").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("3.00").first()).toBeVisible();
});

test("Marge-Waakhond: een factuur-OCR-prijsupdate triggert een alert en herstelt via leverancier wisselen", async ({ page }) => {
  // De simulatie-feed is verwijderd; de Waakhond wordt nu getriggerd door de
  // échte prijsbron: het toepassen van gescande factuurregels (applyInvoiceAction).
  // De voorbeeldfactuur tilt o.a. de roomboter naar €11,20/kg, wat de marge van de
  // actieve Miso-Glazed Salmon onder de kritieke grens (70%) duwt.
  await page.goto("/ocr");
  await page.setInputFiles('[data-testid="ocr-file-input"]', {
    name: "factuur.pdf",
    mimeType: "application/pdf",
    buffer: buildInvoicePdf(SAMPLE_INVOICE_TEXT),
  });
  await page.getByRole("button", { name: "Scan factuur" }).click();
  await expect(page.getByText(/regels herkend/)).toBeVisible({ timeout: 30_000 });

  // Pas de gekoppelde regels toe: dit muteert de voorraadprijzen én roept de
  // Marge-Waakhond aan (dezelfde evaluateMarginAlerts als voorheen de re-sync).
  await page.getByRole("button", { name: /voorraadprijzen bij/ }).click();
  await expect(page.getByText("Voorraadprijzen bijgewerkt")).toBeVisible({ timeout: 15_000 });

  // De bel toont na de prijscascade een waarschuwing.
  const bell = page.getByRole("button", { name: "Marge-Waakhond" });
  await expect(bell).toContainText("1", { timeout: 30_000 });

  await bell.click();
  await expect(page.getByText(/onder de kritieke grens/)).toBeVisible();
  await page.getByRole("button", { name: "Wissel leverancier" }).click();

  // Na herstel is er geen actieve waarschuwing meer.
  await expect(page.getByText(/Geen actieve waarschuwingen/)).toBeVisible({ timeout: 15_000 });
});
