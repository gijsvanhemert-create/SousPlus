"use client";

import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { pct } from "@/lib/format";
import type { MenuItem } from "@/server/menu";

const POP_MID = 150;
const MARGIN_MID = 72;

const COL = { star: "#3f7a5b", plow: "#b6892f", puzzle: "#3e6e8c", dog: "#b4412e" };
const LINE = "#e8e3d8";
const MUTED = "#8a857c";
const CHARCOAL = "#1e2a22";

type Quad = "star" | "plow" | "puzzle" | "dog";
const QUAD: Record<Quad, { label: string; tip: string }> = {
  star: { label: "Winner", tip: "Hoge marge én populair — koester en houd zichtbaar." },
  plow: { label: "Runner", tip: "Populair maar magere marge — verlaag foodcost of verhoog prijs." },
  puzzle: { label: "Sleeper", tip: "Goede marge, weinig verkocht — promoot of herpositioneer." },
  dog: { label: "Loser", tip: "Lage marge én weinig verkocht — heroverweeg of schrap." },
};

function quadOf(pop: number, margin: number): Quad {
  const hi = pop >= POP_MID;
  const hm = margin >= MARGIN_MID;
  return hi && hm ? "star" : hi && !hm ? "plow" : !hi && hm ? "puzzle" : "dog";
}

// Alleen gerechten met een zinvolle marge kunnen op de marge-as geplot worden;
// recepten zonder marge (n.v.t.) laten we buiten de matrix.
type PlottableItem = MenuItem & { marginPct: number };

export function MenuMatrix({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const plotted: PlottableItem[] = items.filter((d): d is PlottableItem => d.marginPct != null);

  const W = 560,
    H = 380,
    padL = 52,
    padB = 44,
    padT = 16,
    padR = 16;
  const x0 = padL,
    x1 = W - padR,
    y0 = H - padB,
    y1 = padT;
  const popMin = 40,
    popMax = 320,
    marMin = 60,
    marMax = 86;
  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const sx = (p: number) => x0 + ((clamp(p, popMin, popMax) - popMin) / (popMax - popMin)) * (x1 - x0);
  const sy = (m: number) => y0 - ((clamp(m, marMin, marMax) - marMin) / (marMax - marMin)) * (y0 - y1);
  const mx = sx(POP_MID),
    my = sy(MARGIN_MID);

  const counts = plotted.reduce<Record<Quad, number>>(
    (o, d) => {
      o[quadOf(d.popularity, d.marginPct)] += 1;
      return o;
    },
    { star: 0, plow: 0, puzzle: 0, dog: 0 },
  );

  // Advies: lichte het zwaarst-wegende werkpaard uit (populair, marge onder norm).
  const plows = plotted
    .filter((d) => quadOf(d.popularity, d.marginPct) === "plow")
    .sort((a, b) => b.popularity - a.popularity);
  const focus = plows[0] ?? null;

  return (
    <div className="max-w-[920px]">
      <p className="mb-5 mt-0 max-w-[560px] text-[14.5px] leading-relaxed text-ink">
        Menu-engineering volgens de Boston-matrix: elk gerecht uitgezet op populariteit (couverts p/m) tegen marge. Zo
        zie je vóór de service welke gerechten dragen, welke verlies lekken en welke aandacht nodig hebben.
      </p>

      <div className="grid items-start gap-5 min-[760px]:grid-cols-[minmax(0,1.5fr)_minmax(220px,1fr)]">
        <div className="rounded-[18px] border border-line bg-card p-4">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full">
            <rect x={mx} y={y1} width={x1 - mx} height={my - y1} fill={COL.star} opacity="0.06" />
            <rect x={mx} y={my} width={x1 - mx} height={y0 - my} fill={COL.plow} opacity="0.06" />
            <rect x={x0} y={y1} width={mx - x0} height={my - y1} fill={COL.puzzle} opacity="0.06" />
            <rect x={x0} y={my} width={mx - x0} height={y0 - my} fill={COL.dog} opacity="0.06" />
            <line x1={mx} y1={y1} x2={mx} y2={y0} stroke={LINE} strokeDasharray="4 4" />
            <line x1={x0} y1={my} x2={x1} y2={my} stroke={LINE} strokeDasharray="4 4" />
            <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={MUTED} strokeWidth="1" />
            <line x1={x0} y1={y1} x2={x0} y2={y0} stroke={MUTED} strokeWidth="1" />
            <text x={x0 + 8} y={y1 + 16} fontSize="11" fontWeight="700" fill={COL.puzzle}>SLEEPERS</text>
            <text x={x1 - 8} y={y1 + 16} fontSize="11" fontWeight="700" fill={COL.star} textAnchor="end">WINNERS</text>
            <text x={x0 + 8} y={y0 - 8} fontSize="11" fontWeight="700" fill={COL.dog}>LOSERS</text>
            <text x={x1 - 8} y={y0 - 8} fontSize="11" fontWeight="700" fill={COL.plow} textAnchor="end">RUNNERS</text>
            <text x={(x0 + x1) / 2} y={H - 8} fontSize="11" fill={MUTED} textAnchor="middle">Populariteit · couverts p/m →</text>
            <text x={14} y={(y0 + y1) / 2} fontSize="11" fill={MUTED} textAnchor="middle" transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>
              Marge % ↑
            </text>
            {plotted.map((d) => {
              const q = quadOf(d.popularity, d.marginPct);
              return (
                <g key={d.id} className="cursor-pointer" onClick={() => router.push(`/lab?recipe=${d.id}`)}>
                  <circle cx={sx(d.popularity)} cy={sy(d.marginPct)} r="8" fill={COL[q]} stroke="#FFF" strokeWidth="2" />
                  <text x={sx(d.popularity)} y={sy(d.marginPct) - 13} fontSize="10.5" fill={CHARCOAL} textAnchor="middle" fontWeight="600">
                    {d.dish.split(" ")[0]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flex flex-col gap-2.5">
          {(["star", "plow", "puzzle", "dog"] as Quad[]).map((q) => (
            <div key={q} className="rounded-[14px] border border-line bg-card px-4 py-3">
              <div className="mb-1 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: COL[q] }} />
                  <span className="text-[13.5px] font-bold">{QUAD[q].label}</span>
                </div>
                <span className="font-serif text-[16px] font-semibold" style={{ color: COL[q] }}>
                  {counts[q]}
                </span>
              </div>
              <div className="text-[12px] leading-snug text-muted">{QUAD[q].tip}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-champagne bg-champagne-soft px-4.5 py-3.5">
        <Wand2 size={17} className="mt-0.5 shrink-0 text-gold-deep" />
        <div className="text-[13.5px] leading-relaxed text-ink">
          {focus ? (
            <>
              <strong>{focus.dish}</strong> staat op {pct(focus.marginPct)} marge en valt in de Runners — populair,
              maar de marge lekt. Vraag Chef Auguste om een goedkopere variant of bescherm de marge via de Waakhond.
            </>
          ) : (
            <>De kaart staat gezond: geen gerecht lekt marge in het werkpaarden-kwadrant. Houd de sterren zichtbaar.</>
          )}
        </div>
      </div>
    </div>
  );
}
