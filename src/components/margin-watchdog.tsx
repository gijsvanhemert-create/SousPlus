"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, TrendingUp, ArrowLeftRight, Check, X, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { useWatchdogStore, type AlertView } from "@/lib/watchdog-store";
import { useChefStore } from "@/lib/chef-store";
import { pct } from "@/lib/format";

// Vooringevulde opdracht voor Chef Auguste bij een marge-alert. Het alertId gaat
// mee zodat hij de juiste alert kan afsluiten (resolve_margin_alert); de rest van
// de situatie zit ook al in de APP-CONTEXT onder 'alerts'.
function alertPrompt(a: AlertView): string {
  const marge = a.currentMarginPct != null ? `${a.currentMarginPct.toFixed(0)}%` : "onder de norm";
  return (
    `De Marge-Waakhond slaat alarm: ${a.ingredient} is ${a.deltaPct.toFixed(0)}% duurder geworden, ` +
    `waardoor de marge op ${a.dish ?? "een gerecht"} zakt tot ${marge} — onder de kritieke grens van 70%. ` +
    `Van leverancier wisselen is hier niet per se de beste oplossing. Denk met me mee: geef een paar concrete, ` +
    `onderbouwde opties (ander ingrediënt of substituut, aangepaste portie, prijsaanpassing, of een combinatie) ` +
    `met per optie het effect op de marge. (alert ${a.id})`
  );
}

export function MarginWatchdog() {
  const router = useRouter();
  const { alerts, open, resolvingId, setOpen, refresh, resolve } = useWatchdogStore();
  const setPendingPrompt = useChefStore((s) => s.setPendingPrompt);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const count = alerts.length;

  function askAuguste(a: AlertView) {
    setPendingPrompt(alertPrompt(a));
    setOpen(false);
    router.push("/chef");
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Marge-Waakhond"
        className="relative grid size-[42px] place-items-center rounded-xl border border-line bg-card text-charcoal transition active:scale-95"
      >
        <Bell size={19} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full bg-danger text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[52px] z-50 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_60px_rgba(21,39,28,.22)]">
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <span className="text-[14px] font-semibold">Marge-Waakhond</span>
              <button onClick={() => setOpen(false)} aria-label="Sluiten" className="text-muted">
                <X size={16} />
              </button>
            </div>

            {count === 0 && (
              <div className="px-5 py-7 text-center text-[13px] text-muted">
                <ShieldCheck size={22} className="mx-auto mb-2 text-success" />
                Geen actieve waarschuwingen. Alle marges binnen norm.
                <div className="mt-1.5 text-[12px]">Scan een factuur in de OCR-module om prijzen bij te werken.</div>
              </div>
            )}

            {alerts.map((a) => {
              const busy = resolvingId === a.id;
              return (
                <div key={a.id} className="border-b border-canvas px-4 py-3.5 last:border-b-0">
                  <div className="mb-2 flex items-center gap-2">
                    <TrendingUp size={16} className="text-danger" />
                    <span className="text-[13.5px] font-bold text-danger">
                      {a.ingredient} +{a.deltaPct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="mb-3 text-[13px] leading-relaxed text-ink">
                    De marge op <strong>{a.dish ?? "een gerecht"}</strong> daalt tot{" "}
                    <strong className="text-danger">
                      {a.currentMarginPct != null ? pct(a.currentMarginPct) : "—"}
                    </strong>{" "}
                    — onder de kritieke grens van 70%.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => resolve(a.id, "switch")}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-forest bg-forest px-3 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />} Wissel leverancier
                    </button>
                    <button
                      onClick={() => resolve(a.id, "accept")}
                      disabled={busy}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border border-gold bg-champagne-soft px-3 py-2 text-[12.5px] font-semibold text-gold-deep disabled:opacity-60"
                    >
                      <Check size={14} /> Prijs accepteren
                    </button>
                  </div>
                  <button
                    onClick={() => askAuguste(a)}
                    disabled={busy}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] px-3 py-1.5 text-[12px] font-semibold text-gold-deep transition hover:bg-champagne-soft disabled:opacity-60"
                  >
                    <Sparkles size={13} /> Vraag Chef Auguste om advies
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
