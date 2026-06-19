"use client";

import { useState, useTransition } from "react";
import { FileText, ScanLine, Loader2, CheckCircle2, Upload } from "lucide-react";
import { eur } from "@/lib/format";
import { scanInvoiceAction, applyInvoiceAction } from "@/server/ocr-actions";
import { useWatchdogStore } from "@/lib/watchdog-store";
import type { InvoiceLine } from "@/server/ocr";

const SAMPLE_INVOICE =
  "GROOTHANDEL SLIGRO B.V. — Factuur 2026-04412\nDatum 14-05-2026  Klant: Bistro+ Den Bosch\n" +
  "------------------------------------------------\nArtikel                 Aantal   Prijs    Totaal\n" +
  "Zalmfilet vers           4,2 kg   29,40    123,48\nRoomboter ongezouten     2,0 kg   11,20     22,40\n" +
  "Sushirijst koshihikari    8,0 kg    3,95     31,60\nSesamzaad geroosterd      0,5 kg   11,30      5,65\n" +
  "Mirin Hon                 2,0 L     9,80     19,60\n------------------------------------------------\nTotaal incl. BTW                           220,98";

export function OcrScan() {
  const [raw, setRaw] = useState("");
  const [stage, setStage] = useState<"idle" | "scanning" | "done">("idle");
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [applied, setApplied] = useState(false);
  const [, startTransition] = useTransition();

  const matched = lines.filter((l) => l.matchedId).length;

  function scan() {
    if (stage === "scanning") return;
    setStage("scanning");
    setApplied(false);
    setLines([]);
    const text = raw.trim() || SAMPLE_INVOICE;
    startTransition(async () => {
      try {
        const res = await scanInvoiceAction(text);
        setLines(res.lines);
      } finally {
        setStage("done");
      }
    });
  }

  function apply() {
    const payload = lines
      .filter((l) => l.matchedId)
      .map((l) => ({ matchedId: l.matchedId as string, keyword: l.keyword, unitPrice: l.unitPrice }));
    if (payload.length === 0) return;
    startTransition(async () => {
      await applyInvoiceAction({ lines: payload });
      setApplied(true);
      void useWatchdogStore.getState().refresh();
    });
  }

  return (
    <div className="max-w-[860px]">
      <p className="mb-5 mt-0 max-w-[560px] text-[14.5px] leading-relaxed text-ink">
        Scan een leveranciersfactuur — geen handmatige invoer meer. De OCR-laag (Tier 1) leest de regels uit en koppelt
        ze aan je voorraadprijzen, zodat je calculaties automatisch kloppen.
      </p>

      <div className="grid gap-5 min-[720px]:grid-cols-2">
        {/* Invoer */}
        <div className="rounded-[18px] border border-line bg-card p-5">
          <div className="relative mb-3.5 overflow-hidden rounded-[14px] border-2 border-dashed border-line bg-canvas px-4.5 py-6 text-center">
            {stage === "scanning" && (
              <div className="absolute left-0 right-0 h-0.5 bg-gold shadow-[0_0_12px_var(--color-gold)] [animation:sp-scan_1.4s_linear_infinite]" />
            )}
            <div className="mx-auto mb-2.5 grid size-12 place-items-center rounded-xl bg-champagne-soft">
              <FileText size={24} className="text-gold-deep" />
            </div>
            <div className="text-[13.5px] font-semibold">factuur_sligro_04412.pdf</div>
            <div className="mt-0.5 text-xs text-muted">of plak hieronder de factuurtekst</div>
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Plak hier de tekst van een factuur…"
            rows={5}
            className="w-full resize-y rounded-xl border border-line bg-canvas p-3 text-[13px] text-charcoal"
          />
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => setRaw(SAMPLE_INVOICE)}
              className="rounded-[11px] border border-line bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink"
            >
              Voorbeeld
            </button>
            <button
              onClick={scan}
              disabled={stage === "scanning"}
              className="flex flex-1 items-center justify-center gap-2 rounded-[11px] bg-forest px-3.5 py-2.5 text-[13.5px] font-semibold text-white disabled:cursor-wait"
            >
              {stage === "scanning" ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
              {stage === "scanning" ? "Scant factuur…" : "Scan factuur"}
            </button>
          </div>
        </div>

        {/* Resultaat */}
        <div className="min-h-[200px] rounded-[18px] border border-line bg-card p-5">
          {stage !== "done" && (
            <div className="py-[50px] text-center text-[13.5px] text-muted">
              {stage === "scanning" ? "Regels worden uitgelezen…" : "Nog geen factuur gescand."}
            </div>
          )}
          {stage === "done" && (
            <div>
              <div className="mb-3.5 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-success" />
                <span className="text-[14px] font-semibold">
                  {lines.length} regels herkend · {matched} gekoppeld
                </span>
              </div>
              {lines.map((it, i) => (
                <div key={i} className="flex items-center justify-between border-b border-canvas py-2.5">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium">{it.name}</div>
                    <div className="text-[11.5px] text-muted">
                      {String(it.qty).replace(".", ",")} {it.unit}{" "}
                      {it.matchedId && <span className="text-success">· {it.matchedName}</span>}
                    </div>
                  </div>
                  <div className="text-right tabular-nums">
                    <div className="text-[13.5px] font-semibold">{eur(it.unitPrice)}</div>
                    <div className="text-[11.5px] text-muted">{eur(it.total)}</div>
                  </div>
                </div>
              ))}
              <button
                onClick={apply}
                disabled={applied || matched === 0}
                className={`mt-3.5 flex w-full items-center justify-center gap-2 rounded-[11px] border border-gold px-3.5 py-2.5 text-[13.5px] font-semibold ${
                  applied ? "bg-success-soft text-success" : "bg-champagne-soft text-gold-deep"
                } disabled:opacity-60`}
              >
                {applied ? (
                  <>
                    <CheckCircle2 size={16} /> Voorraadprijzen bijgewerkt
                  </>
                ) : (
                  <>
                    <Upload size={16} /> Werk voorraadprijzen bij
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
