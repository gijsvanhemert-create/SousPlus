import { describe, it, expect, vi, beforeEach } from "vitest";

// Fase 1 — vision-pariteit: de foto-/PDF-extractie levert dezelfde
// gestructureerde regels + catalogus-matching op als de tekst-flow.
//
// Zonder ANTHROPIC_API_KEY kiest de router de MockAdapter; die parseert bij
// tekst de meegegeven string en valt bij een foto/PDF terug op de
// voorbeeldfactuur — zo is de pariteit deterministisch te testen. Prisma wordt
// gemockt zodat de catalogus-matching hermetisch is.
vi.stubEnv("ANTHROPIC_API_KEY", "");

const { db } = vi.hoisted(() => ({
  db: {
    catalogItem: {
      findFirst: vi.fn<(args: { where?: { name?: { contains?: string } } }) => Promise<unknown>>(
        async () => null,
      ),
    },
  },
}));
vi.mock("@/server/db", () => ({ prisma: db }));

import { scanInvoice } from "./ocr";
import { SAMPLE_INVOICE_TEXT } from "@/lib/ocr-sample";

// De mock leest het beeld niet uit; de inhoud is dus willekeurig.
const FAKE_B64 = "aGVsbG8=";

describe("scanInvoice — vision-pariteit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("levert dezelfde regels op vanuit tekst, foto en PDF", async () => {
    const fromText = await scanInvoice({ kind: "text", text: SAMPLE_INVOICE_TEXT }, "loc1");
    const fromImage = await scanInvoice({ kind: "image", mediaType: "image/jpeg", data: FAKE_B64 }, "loc1");
    const fromPdf = await scanInvoice({ kind: "pdf", data: FAKE_B64 }, "loc1");

    expect(fromText.length).toBeGreaterThan(0);
    expect(fromImage).toEqual(fromText);
    expect(fromPdf).toEqual(fromText);
  });

  it("koppelt een herkende regel aan een catalogusartikel", async () => {
    db.catalogItem.findFirst.mockImplementation(
      async (args: { where?: { name?: { contains?: string } } }) => {
        return args.where?.name?.contains === "zalmfilet"
          ? { id: "cat-zalm", name: "Zalmfilet MSC" }
          : null;
      },
    );

    const lines = await scanInvoice({ kind: "image", mediaType: "image/jpeg", data: FAKE_B64 }, "loc1");
    const zalm = lines.find((l) => l.name.toLowerCase().startsWith("zalmfilet"));

    expect(zalm?.matchedId).toBe("cat-zalm");
    expect(zalm?.matchedName).toBe("Zalmfilet MSC");
    // Niet-gematchte regels blijven zichtbaar maar ongekoppeld.
    expect(lines.some((l) => l.matchedId === null)).toBe(true);
  });
});
