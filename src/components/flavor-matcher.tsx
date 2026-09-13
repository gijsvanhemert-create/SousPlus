"use client";

import { useState } from "react";
import { Sparkles, Search } from "lucide-react";
import { FLAVOR_DB, FLAVOR_FILTERS } from "@/lib/flavor-data";

export function FlavorMatcher() {
  const [query, setQuery] = useState("Salmon");
  const [filters, setFilters] = useState<string[]>([]);

  const key = query.trim().toLowerCase();
  const base = FLAVOR_DB[key] ?? FLAVOR_DB.salmon;
  const usingFallback = !FLAVOR_DB[key];
  const results = base.filter((r) => filters.length === 0 || filters.every((f) => r.tags.includes(f)));

  const toggle = (t: string) => setFilters((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  return (
    <div className="max-w-[760px]">
      <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-champagne bg-champagne-soft px-3 py-1.5 text-xs font-semibold text-gold-deep">
        <Sparkles size={14} /> Curated culinary intelligence · Foodpairing®-ready
      </div>
      <p className="mb-[22px] mt-0 text-[14.5px] leading-relaxed text-ink">
        Onderbouw nieuwe gerechten met affinity-data in plaats van giswerk. De pilot draait op een gecureerde dataset
        uit voedselchemie en de kennis van onze ambassadeur-chefs; de live Foodpairing®-koppeling schakelt in na
        pilot-validatie.
      </p>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-4 top-4 text-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Zoek een ingrediënt (Salmon, Tomato, Beef)…"
          className="w-full rounded-[14px] border border-line bg-card py-3.5 pl-12 pr-4 text-[15px] text-charcoal"
        />
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2.5">
        <span className="mr-1 text-xs text-muted">Smaakprofiel:</span>
        {FLAVOR_FILTERS.map((t) => {
          const on = filters.includes(t);
          return (
            <button
              key={t}
              onClick={() => toggle(t)}
              className={`rounded-full border px-4 py-1.5 text-[13px] font-semibold transition ${
                on ? "border-gold bg-gold text-white" : "border-line bg-card text-ink hover:border-gold"
              }`}
            >
              {t}
            </button>
          );
        })}
        {filters.length > 0 && (
          <button onClick={() => setFilters([])} className="text-[12.5px] text-muted underline">
            wissen
          </button>
        )}
      </div>

      <div className="my-4 text-[12.5px] text-muted">
        {usingFallback && query.trim() !== ""
          ? `Geen dataset voor "${query}" — pairings voor Salmon getoond.`
          : `${results.length} matches voor ${query.trim() || "Salmon"}`}
      </div>

      <div className="flex flex-col gap-2.5">
        {results.map((r) => (
          <div key={r.name} className="rounded-[14px] border border-line bg-card px-4.5 py-3.5">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[15px] font-semibold">{r.name}</span>
                <div className="flex gap-1.5">
                  {r.tags.map((t) => (
                    <span key={t} className="rounded-full bg-canvas px-2 py-0.5 text-[10.5px] font-semibold text-muted">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <span className="font-serif text-[19px] font-semibold tabular-nums text-gold-deep">{r.score}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-canvas">
              <div
                className="h-full rounded-full bg-gradient-to-r from-champagne to-gold"
                style={{ width: `${r.score}%` }}
              />
            </div>
          </div>
        ))}
        {results.length === 0 && (
          <div className="py-8 text-center text-sm text-muted">
            Geen ingrediënten matchen alle filters. Verwijder een smaakprofiel.
          </div>
        )}
      </div>
    </div>
  );
}
