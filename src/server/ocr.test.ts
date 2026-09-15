import { describe, it, expect, vi, beforeEach } from "vitest";

// Vision-pariteit + verbeterde matching. Zonder ANTHROPIC_API_KEY kiest de router
// de MockAdapter; die parseert bij tekst de meegegeven string en valt bij een
// foto/PDF terug op de voorbeeldfactuur. Prisma wordt gemockt zodat de
// catalogus-matching hermetisch is.
vi.stubEnv("ANTHROPIC_API_KEY", "");

const { db } = vi.hoisted(() => ({
  db: {
    catalogItem: {
      findMany: vi.fn<(args: { where?: unknown }) => Promise<Array<{ id: string; name: string; price: unknown }>>>(
        async () => [],
      ),
    },
  },
}));
vi.mock("@/server/db", () => ({ prisma: db }));

import { scanInvoice, bestCandidate } from "./ocr";
import { SAMPLE_INVOICE_TEXT } from "@/lib/ocr-sample";

const FAKE_B64 = "aGVsbG8=";

describe("bestCandidate", () => {
  it("kiest de kandidaat met de meeste overlappende tokens, óók boven een lagere prijs", () => {
    const cands = [
      { id: "a", name: "Roomboter", price: 5 }, // 1 overlap, goedkoper
      { id: "b", name: "Roomboter ongezouten", price: 28 }, // 2 overlappen
    ];
    expect(bestCandidate(["roomboter", "ongezouten"], cands)?.id).toBe("b");
  });

  it("kiest bij gelijke overlap de laagste prijs", () => {
    const cands = [
      { id: "duur", name: "Roomboter ongezouten AA", price: 12 },
      { id: "goedkoop", name: "Roomboter ongezouten", price: 9 },
    ];
    expect(bestCandidate(["roomboter"], cands)?.id).toBe("goedkoop");
  });

  it("geeft null zonder token-overlap", () => {
    expect(bestCandidate(["mirin"], [{ id: "x", name: "Sushirijst", price: 3 }])).toBeNull();
  });

  it("negeert een los generiek woord onder de drempel (geen valse match)", () => {
    // "vers" (4) alleen is te generiek — komt in tientallen artikelen voor.
    expect(bestCandidate(["vers"], [{ id: "z", name: "Zalmfilet vers (Noorwegen)", price: 28.5 }])).toBeNull();
    // Met het specifieke woord erbij wél een match.
    expect(bestCandidate(["drakenfruit", "vers"], [{ id: "z", name: "Zalmfilet vers (Noorwegen)", price: 28.5 }])).toBeNull();
    expect(bestCandidate(["zalmfilet", "vers"], [{ id: "z", name: "Zalmfilet vers (Noorwegen)", price: 28.5 }])?.id).toBe("z");
  });
});

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

  it("koppelt een herkende regel aan het best passende catalogusartikel", async () => {
    db.catalogItem.findMany.mockResolvedValue([
      { id: "cat-zalm", name: "Zalmfilet vers (Noorwegen)", price: 28.5 },
    ]);

    const lines = await scanInvoice({ kind: "image", mediaType: "image/jpeg", data: FAKE_B64 }, "loc1");
    const zalm = lines.find((l) => l.name.toLowerCase().startsWith("zalmfilet"));

    expect(zalm?.matchedId).toBe("cat-zalm");
    expect(zalm?.matchedName).toBe("Zalmfilet vers (Noorwegen)");
    // Regels zonder token-overlap blijven ongekoppeld.
    expect(lines.some((l) => l.matchedId === null)).toBe(true);
  });
});
