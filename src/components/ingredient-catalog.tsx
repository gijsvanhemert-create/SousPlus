"use client";

import { useMemo, useState } from "react";
import { Store, PackageSearch } from "lucide-react";
import { eur } from "@/lib/format";
import { SUPPLIER_LABEL, SUPPLIER_BADGE } from "@/lib/supplier";
import type { CatalogRow } from "@/server/catalog";

const SUPPLIERS = ["Alle", "Hanos", "Sligro", "Beide"];
const PAGE = 60;

export function IngredientCatalog({
  items,
  categories,
  counts,
}: {
  items: CatalogRow[];
  categories: string[];
  counts: { hanos: number; sligro: number; total: number };
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Alle");
  const [sup, setSup] = useState("Alle");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter(
      (it) =>
        (cat === "Alle" || it.category === cat) &&
        (sup === "Alle" || SUPPLIER_LABEL[it.supplier] === sup || (sup !== "Beide" && it.supplier === "BEIDE")) &&
        (term === "" || it.name.toLowerCase().includes(term) || it.category.toLowerCase().includes(term)),
    );
  }, [items, q, cat, sup]);

  // Reset de paginering wanneer de filters wijzigen (afgeleid van de filter-key).
  const filterKey = `${q}|${cat}|${sup}`;
  const [prevKey, setPrevKey] = useState(filterKey);
  if (prevKey !== filterKey) {
    setPrevKey(filterKey);
    setLimit(PAGE);
  }

  const shown = filtered.slice(0, limit);
  const catTabs = ["Alle", ...categories];

  return (
    <div>
      <div className="mb-3.5 inline-flex items-center gap-2 rounded-full border border-champagne bg-champagne-soft px-3 py-1.5 text-xs font-semibold text-gold-deep">
        <Store size={14} /> Hanos &amp; Sligro assortiment · indicatieve groothandelsprijzen · feed-ready
      </div>
      <p className="mb-[18px] mt-0 max-w-[620px] text-[14.5px] leading-relaxed text-ink">
        Een doorzoekbare basis van {counts.total} kernartikelen over {categories.length} categorieën — de ruggengraat
        van je inkoop. In productie schakelt hier de live Hanos/Sligro-koppeling in, zodat het volledige assortiment en
        de actuele dagprijzen automatisch binnenkomen.
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
        <Stat label="Artikelen" value={String(counts.total)} />
        <Stat label="Via Hanos" value={String(counts.hanos)} accent="text-info" />
        <Stat label="Via Sligro" value={String(counts.sligro)} accent="text-success" />
      </div>

      <div className="relative mb-3">
        <PackageSearch size={18} className="absolute left-4 top-3.5 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek een artikel of categorie… (bv. zalm, miso, room, saffraan)"
          className="w-full rounded-[14px] border border-line bg-card py-3 pl-12 pr-4 text-[15px] text-charcoal"
        />
      </div>

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="mr-0.5 text-xs text-muted">Leverancier:</span>
        {SUPPLIERS.map((s) => {
          const on = sup === s;
          return (
            <button
              key={s}
              onClick={() => setSup(s)}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition ${
                on ? "border-gold bg-gold text-white" : "border-line bg-card text-ink hover:border-gold"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {catTabs.map((c) => {
          const on = cat === c;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`shrink-0 rounded-[10px] border px-3 py-1.5 text-[12.5px] transition ${
                on ? "border-gold bg-champagne-soft font-bold text-gold-deep" : "border-line bg-card font-medium text-muted"
              }`}
            >
              {c}
            </button>
          );
        })}
      </div>

      <div className="mb-2.5 text-[12.5px] text-muted">
        {filtered.length} resultaten{cat !== "Alle" ? ` in ${cat}` : ""}
        {q.trim() ? ` voor "${q.trim()}"` : ""}
      </div>

      <div className="overflow-x-auto rounded-[18px] border border-line bg-card">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[2.4fr_1.4fr_1fr_0.9fr] gap-3 border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <span>Artikel</span>
            <span>Categorie</span>
            <span>Leverancier</span>
            <span className="text-right">Prijs</span>
          </div>
          {shown.map((it) => (
            <div key={it.id} className="grid grid-cols-[2.4fr_1.4fr_1fr_0.9fr] items-center gap-3 border-b border-canvas px-5 py-3">
              <span className="text-[14px] font-semibold">{it.name}</span>
              <span className="text-[12.5px] text-muted">{it.category}</span>
              <span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${SUPPLIER_BADGE[it.supplier]}`}>
                  {SUPPLIER_LABEL[it.supplier]}
                </span>
              </span>
              <span className="text-right font-serif text-[15.5px] font-semibold tabular-nums">
                {eur(it.price)}
                <span className="font-sans text-[11px] text-muted">/{it.unit}</span>
              </span>
            </div>
          ))}
          {shown.length === 0 && (
            <div className="px-5 py-9 text-center text-sm text-muted">Geen artikelen gevonden. Pas je zoekterm of filters aan.</div>
          )}
        </div>
      </div>

      {filtered.length > limit && (
        <div className="mt-4 text-center">
          <button
            onClick={() => setLimit((l) => l + 80)}
            className="rounded-xl border border-line bg-card px-5 py-2.5 text-[13.5px] font-semibold text-ink transition hover:border-gold"
          >
            Toon meer ({filtered.length - limit} resterend)
          </button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent = "text-charcoal" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex-1 basis-[200px] rounded-[14px] border border-line bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className={`mt-1 font-serif text-[23px] font-semibold ${accent}`}>{value}</div>
    </div>
  );
}
