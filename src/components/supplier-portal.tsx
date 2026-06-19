"use client";

import { useState, useTransition } from "react";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { eur } from "@/lib/format";
import { SUPPLIER_LABEL } from "@/lib/supplier";
import { reSyncPrices } from "@/server/supplier-actions";
import { useWatchdogStore } from "@/lib/watchdog-store";
import type { SupplierLine } from "@/server/supplier";

export function SupplierPortal({ lines: initialLines }: { lines: SupplierLine[] }) {
  const [lines, setLines] = useState(initialLines);
  const [flash, setFlash] = useState<Record<string, "up" | "down">>({});
  const [isPending, startTransition] = useTransition();

  function reSync() {
    if (isPending) return;
    startTransition(async () => {
      const prevById = new Map(lines.map((l) => [l.id, l.price]));
      const { lines: next } = await reSyncPrices();
      const flashes: Record<string, "up" | "down"> = {};
      for (const l of next) {
        const prev = prevById.get(l.id) ?? l.price;
        flashes[l.id] = l.price >= prev ? "up" : "down";
      }
      setLines(next);
      setFlash(flashes);
      setTimeout(() => setFlash({}), 1600);
      // De Waakhond-bel direct laten reageren op de prijscascade.
      void useWatchdogStore.getState().refresh();
    });
  }

  return (
    <div className="max-w-[820px]">
      <div className="mb-[22px] flex flex-wrap items-end justify-between gap-4">
        <p className="m-0 max-w-[460px] text-[14.5px] leading-relaxed text-ink">
          Live inkoopprijzen uit de groothandel-API&apos;s. Een Re-Sync simuleert marktfluctuaties die direct
          doorrekenen in elke calculatie en marge.
        </p>
        <button
          onClick={reSync}
          disabled={isPending}
          className="inline-flex items-center gap-2.5 rounded-xl border border-forest bg-forest px-4.5 py-3 text-[13.5px] font-semibold text-white disabled:cursor-wait disabled:opacity-80"
        >
          <RefreshCw size={16} className={isPending ? "animate-spin" : ""} />
          {isPending ? "Synct met API's…" : "Force Live API Re-Sync"}
        </button>
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-line bg-card">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[2fr_1.3fr_1fr_0.7fr] gap-3 border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <span>Ingrediënt</span>
            <span>Leverancier</span>
            <span className="text-right">Inkoopprijs</span>
            <span className="text-right">Trend</span>
          </div>
          {lines.map((l) => {
            const f = flash[l.id];
            return (
              <div
                key={l.id}
                className="grid grid-cols-[2fr_1.3fr_1fr_0.7fr] items-center gap-3 border-b border-canvas px-5 py-3.5 transition-colors"
                style={{ background: f === "up" ? "var(--color-danger-soft)" : "transparent" }}
              >
                <span className="text-[14px] font-semibold">{l.name}</span>
                <span className="text-[13px] text-muted">{SUPPLIER_LABEL[l.supplier]}</span>
                <span
                  className={`text-right font-serif text-[17px] font-semibold tabular-nums ${
                    f === "up" ? "text-danger" : f === "down" ? "text-success" : "text-charcoal"
                  }`}
                >
                  {eur(l.price)}
                  <span className="font-sans text-[11px] text-muted">/{l.unit}</span>
                </span>
                <span className="flex justify-end">
                  {f === "up" ? (
                    <TrendingUp size={17} className="text-danger" />
                  ) : f === "down" ? (
                    <TrendingDown size={17} className="text-success" />
                  ) : (
                    <span className="text-line">—</span>
                  )}
                </span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 px-5 py-3 text-xs text-muted">
            <span className={`size-1.5 rounded-full ${isPending ? "bg-gold" : "bg-success"}`} />
            {isPending ? "Verbinding met leveranciers…" : `${lines.length} API-koppelingen actief`}
          </div>
        </div>
      </div>

      <p className="mt-3 text-[12px] text-muted">
        Gesimuleerd: in productie schakelt hier een echte feed-adapter per leverancier in. Elke wijziging wordt
        vastgelegd in de prijshistorie en herberekent de marges in de Recipe Lab, Library en Menu Matrix.
      </p>
    </div>
  );
}
