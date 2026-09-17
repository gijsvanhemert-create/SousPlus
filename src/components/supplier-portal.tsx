import { eur } from "@/lib/format";
import { SUPPLIER_LABEL } from "@/lib/supplier";
import type { SupplierLine } from "@/server/supplier";

// Alleen-lezen inkoopprijs-overzicht. De vroegere "Force Live API Re-Sync" (een
// gesimuleerde feed met ±3%-fluctuatie en een gescripte boterschok) is verwijderd:
// dat suggereerde ten onrechte een live leverancierskoppeling. Echte prijs­updates
// lopen nu via de factuur-OCR (zie ocr-actions.applyInvoiceAction), die ook de
// Marge-Waakhond triggert. Deze module toont enkel de actuele catalogusprijzen.
export function SupplierPortal({ lines }: { lines: SupplierLine[] }) {
  return (
    <div className="max-w-[820px]">
      <div className="mb-[22px]">
        <p className="m-0 max-w-[520px] text-[14.5px] leading-relaxed text-ink">
          Actuele inkoopprijzen van de kernartikelen die je marge bepalen. Prijzen worden bijgewerkt
          zodra je een factuur scant in de OCR-module; elke wijziging landt in de prijshistorie en
          herberekent de marges in de Recipe Lab, Library en Menu Matrix.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-line bg-card">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[2fr_1.3fr_1fr] gap-3 border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <span>Ingrediënt</span>
            <span>Leverancier</span>
            <span className="text-right">Inkoopprijs</span>
          </div>
          {lines.map((l) => (
            <div
              key={l.id}
              className="grid grid-cols-[2fr_1.3fr_1fr] items-center gap-3 border-b border-canvas px-5 py-3.5"
            >
              <span className="text-[14px] font-semibold">{l.name}</span>
              <span className="text-[13px] text-muted">{SUPPLIER_LABEL[l.supplier]}</span>
              <span className="text-right font-serif text-[17px] font-semibold tabular-nums text-charcoal">
                {eur(l.price)}
                <span className="font-sans text-[11px] text-muted">/{l.unit}</span>
              </span>
            </div>
          ))}
          <div className="flex items-center gap-1.5 px-5 py-3 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            {lines.length} kernartikelen gevolgd
          </div>
        </div>
      </div>
    </div>
  );
}
