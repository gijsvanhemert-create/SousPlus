import { describe, it, expect } from "vitest";
import {
  placeLabels,
  placementBox,
  cornerLabelBoxes,
  boxesOverlap,
  scaleX,
  scaleY,
  type LabelInput,
} from "@/lib/matrix-layout";

// De echte, problematische dataset (Old Skool-demo): vijf gerechten op
// populariteit 0 (linkerrand), waarvan twee ook nog op dezelfde marge-hoogte
// clampen. Hier viel de tekst eerder over elkaar en over de hoek-labels.
const DATA: { dish: string; popularity: number; marginPct: number }[] = [
  { dish: "Miso-Glazed Salmon", popularity: 240, marginPct: 68 },
  { dish: "Cacio e Pepe", popularity: 300, marginPct: 73 },
  { dish: "Celeri Wellington", popularity: 0, marginPct: 90.8 },
  { dish: "Dark Chocolate Fondant", popularity: 210, marginPct: 82 },
  { dish: "Dutch Fish Taco", popularity: 0, marginPct: 89.4 },
  { dish: "Pan-Seared Salmon", popularity: 0, marginPct: 69.1 },
  { dish: "Seared Scallops", popularity: 0, marginPct: 70 },
  { dish: "Seared Scallops", popularity: 70, marginPct: 66 },
  { dish: "Truffel Paddenstoelen Risotto", popularity: 0, marginPct: 83.6 },
  { dish: "Truffel Tagliatelle", popularity: 180, marginPct: 68 },
];

function buildPoints(): LabelInput[] {
  return DATA.map((d, i) => ({
    id: String(i),
    cx: scaleX(d.popularity),
    cy: scaleY(d.marginPct),
    text: d.dish.split(" ")[0],
  }));
}

describe("Menu Matrix label-layout", () => {
  it("plaatst alle punt-labels zonder onderlinge overlap", () => {
    const placements = placeLabels(buildPoints(), cornerLabelBoxes());
    const boxes = placements.map(placementBox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(boxesOverlap(boxes[i], boxes[j], 0), `label ${i} overlapt label ${j}`).toBe(false);
      }
    }
  });

  it("laat punt-labels de hoek-labelvakken (kwadrantnamen) vrij", () => {
    const corners = cornerLabelBoxes();
    const placements = placeLabels(buildPoints(), corners);
    for (const p of placements) {
      const b = placementBox(p);
      for (const c of corners) {
        expect(boxesOverlap(b, c, 0), `label "${p.text}" overlapt een hoek-label`).toBe(false);
      }
    }
  });

  it("geeft voor elk punt precies één placement terug", () => {
    const points = buildPoints();
    const placements = placeLabels(points, cornerLabelBoxes());
    expect(placements).toHaveLength(points.length);
    expect(new Set(placements.map((p) => p.id)).size).toBe(points.length);
  });
});
