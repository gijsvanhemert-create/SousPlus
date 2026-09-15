// Pure geometrie + label-layout voor de Menu Matrix-scatter. Los van de component
// zodat het testbaar is én een preview-script exact dezelfde plaatsing gebruikt.
//
// Probleem dat dit oplost: meerdere gerechten kunnen op (bijna) dezelfde plek
// vallen (bv. alles met populariteit 0 op de linkerrand), waardoor hun labels —
// en de hoek-labels van de kwadranten — over elkaar heen vallen. placeLabels
// zoekt per punt een vrije positie (boven/onder/naast, desnoods kleiner) die niet
// botst met al geplaatste labels of de gereserveerde hoek-labelvakken.

export const MATRIX = {
  W: 560,
  H: 380,
  padL: 52,
  padB: 44,
  padT: 16,
  padR: 16,
  popMin: 40,
  popMax: 320,
  marMin: 60,
  marMax: 86,
  POP_MID: 150,
  MARGIN_MID: 72,
} as const;

export const X0 = MATRIX.padL;
export const X1 = MATRIX.W - MATRIX.padR;
export const Y0 = MATRIX.H - MATRIX.padB;
export const Y1 = MATRIX.padT;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const scaleX = (p: number) =>
  X0 + ((clamp(p, MATRIX.popMin, MATRIX.popMax) - MATRIX.popMin) / (MATRIX.popMax - MATRIX.popMin)) * (X1 - X0);
export const scaleY = (m: number) =>
  Y0 - ((clamp(m, MATRIX.marMin, MATRIX.marMax) - MATRIX.marMin) / (MATRIX.marMax - MATRIX.marMin)) * (Y0 - Y1);

export type Quad = "star" | "plow" | "puzzle" | "dog";
export function quadOf(pop: number, margin: number): Quad {
  const hi = pop >= MATRIX.POP_MID;
  const hm = margin >= MATRIX.MARGIN_MID;
  return hi && hm ? "star" : hi && !hm ? "plow" : !hi && hm ? "puzzle" : "dog";
}

export type Box = { x: number; y: number; w: number; h: number };
export function boxesOverlap(a: Box, b: Box, gap = 2): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

export type Anchor = "start" | "middle" | "end";
export type LabelInput = { id: string; cx: number; cy: number; text: string };
export type LabelPlacement = { id: string; x: number; y: number; text: string; fontSize: number; anchor: Anchor };

// Breedte-schatting (ruim, want de labels zijn semibold): ≈ 0,62 × fontSize.
const charW = (fs: number) => fs * 0.62;

function boxFor(cx: number, cy: number, text: string, fs: number, anchor: Anchor, dx: number, dy: number): { box: Box; x: number; y: number } {
  const w = text.length * charW(fs) + 3;
  const h = fs + 3;
  const x = cx + dx; // baseline-x (het SVG text x-attribuut)
  const y = cy + dy; // baseline-y
  const boxX = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return { box: { x: boxX, y: y - fs, w, h }, x, y };
}

/**
 * Plaats labels zonder overlap. `points` in prioriteitsvolgorde (eerste krijgt de
 * voorkeurspositie). `reserved` zijn vaste vakken (hoek-labels) die vrij blijven.
 * Labels blijven binnen de plot-grenzen.
 */
export function placeLabels(points: LabelInput[], reserved: Box[] = []): LabelPlacement[] {
  const placed: Box[] = [...reserved];
  const out: LabelPlacement[] = [];

  // Kandidaat-offsets per punt, van meest gewenst naar minst. Ruime verticale
  // spreiding voor zij-labels, zodat de drukke linkerrand (veel punten op pop 0)
  // netjes opgestapeld wordt. Positieve dy (omlaag) eerst: bij de bovenrand blijft
  // dat binnen de plot; onderrand-punten vallen dan vanzelf terug op omhoog.
  const sideDy = [3.5, 18.5, 33.5, -12, -27, 48.5, -42];
  const candidates: { dx: number; dy: number; anchor: Anchor; fs: number }[] = [];
  for (const fs of [10.5, 9.5, 8.5]) {
    candidates.push({ dx: 0, dy: -11, anchor: "middle", fs });
    candidates.push({ dx: 0, dy: 16, anchor: "middle", fs });
    candidates.push({ dx: 0, dy: -25, anchor: "middle", fs });
    candidates.push({ dx: 0, dy: 30, anchor: "middle", fs });
    for (const dy of sideDy) candidates.push({ dx: 10, dy, anchor: "start", fs }); // rechts (werkt op de linkerrand)
    for (const dy of sideDy) candidates.push({ dx: -10, dy, anchor: "end", fs }); // links (werkt op de rechterrand)
  }

  const withinBounds = (b: Box) => b.x >= X0 - 6 && b.x + b.w <= X1 + 6 && b.y >= 2 && b.y + b.h <= Y0 + 4;

  for (const p of points) {
    let chosen: { box: Box; x: number; y: number; fs: number; anchor: Anchor } | null = null;
    for (const c of candidates) {
      const { box, x, y } = boxFor(p.cx, p.cy, p.text, c.fs, c.anchor, c.dx, c.dy);
      if (!withinBounds(box)) continue;
      if (placed.some((q) => boxesOverlap(box, q))) continue;
      chosen = { box, x, y, fs: c.fs, anchor: c.anchor };
      break;
    }
    // Laatste redmiddel: kleinste font boven het punt, ook als het overlapt.
    if (!chosen) {
      const { box, x, y } = boxFor(p.cx, p.cy, p.text, 8.5, "middle", 0, -11);
      chosen = { box, x, y, fs: 8.5, anchor: "middle" };
    }
    placed.push(chosen.box);
    out.push({ id: p.id, x: chosen.x, y: chosen.y, text: p.text, fontSize: chosen.fs, anchor: chosen.anchor });
  }
  return out;
}

/** Reconstrueer het bounding-box van een geplaatst label (voor tests/render). */
export function placementBox(p: LabelPlacement): Box {
  const w = p.text.length * charW(p.fontSize) + 3;
  const x = p.anchor === "middle" ? p.x - w / 2 : p.anchor === "end" ? p.x - w : p.x;
  return { x, y: p.y - p.fontSize, w, h: p.fontSize + 3 };
}

// De vaste hoek-labelvakken (kwadrantnamen), zodat punt-labels die ontwijken.
export function cornerLabelBoxes(): Box[] {
  const fs = 11;
  const mk = (text: string, x: number, y: number, anchor: Anchor): Box => {
    const w = text.length * (fs * 0.62) + 3;
    return { x: anchor === "end" ? x - w : x, y: y - fs, w, h: fs + 4 };
  };
  return [
    mk("SLEEPERS", X0 + 8, Y1 + 16, "start"),
    mk("WINNERS", X1 - 8, Y1 + 16, "end"),
    mk("LOSERS", X0 + 8, Y0 - 8, "start"),
    mk("RUNNERS", X1 - 8, Y0 - 8, "end"),
  ];
}
