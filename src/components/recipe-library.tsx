"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, ChefHat, ArrowRight } from "lucide-react";
import { eur, pct } from "@/lib/format";
import { toggleFavorite } from "@/server/menu-actions";
import type { MenuItem } from "@/server/menu";

const CAT_TINT: Record<string, string> = {
  Seafood: "from-[#E8D5B5] to-[#F4E9D2] text-[#9c6b3b]",
  Pasta: "from-[#ECDFB0] to-[#D8C27A] text-[#8C6E3C]",
  Vegetable: "from-[#C97E8C] to-[#9E4B5C] text-white",
  Desserts: "from-[#8A5C45] to-[#5B3A2E] text-white",
};

export function RecipeLibrary({ items: initialItems }: { items: MenuItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [prev, setPrev] = useState(initialItems);
  if (prev !== initialItems) {
    setPrev(initialItems);
    setItems(initialItems);
  }
  const [cat, setCat] = useState("Alle");
  const [, startTransition] = useTransition();

  const categories = ["Alle", ...Array.from(new Set(initialItems.map((i) => i.category)))];
  const shown = items.filter((r) => cat === "Alle" || r.category === cat);

  function onFavorite(id: string) {
    setItems((list) => list.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)));
    startTransition(async () => {
      await toggleFavorite({ recipeId: id });
    });
  }

  return (
    <div>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {categories.map((c) => {
          const on = cat === c;
          const count = c === "Alle" ? items.length : items.filter((r) => r.category === c).length;
          return (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`-mb-px shrink-0 border-b-2 px-4 pb-3 pt-2.5 text-[14px] transition ${
                on ? "border-gold font-bold text-charcoal" : "border-transparent font-medium text-muted"
              }`}
            >
              {c}
              <span className="ml-1.5 text-[11px] text-muted">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-[18px]">
        {shown.map((r) => {
          const crit = r.marginPct < 70;
          const tint = CAT_TINT[r.category] ?? "from-champagne to-canvas text-gold-deep";
          return (
            <button
              key={r.id}
              onClick={() => router.push(`/lab?recipe=${r.id}`)}
              className="group overflow-hidden rounded-[18px] border border-line bg-card text-left transition hover:border-gold"
            >
              <div className={`relative grid place-items-center bg-gradient-to-br py-[18px] ${tint}`}>
                <ChefHat size={48} strokeWidth={1.3} />
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFavorite(r.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onFavorite(r.id);
                    }
                  }}
                  aria-label="Favoriet"
                  className="absolute right-3 top-3 grid size-9 cursor-pointer place-items-center rounded-full border border-line bg-card"
                >
                  <Heart size={17} className={r.favorite ? "text-danger" : "text-muted"} fill={r.favorite ? "currentColor" : "none"} />
                </span>
                <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-champagne-soft px-2.5 py-0.5 text-[10.5px] font-semibold text-gold-deep">
                  Open in Lab <ArrowRight size={11} />
                </span>
              </div>
              <div className="px-4.5 pb-4.5 pt-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">{r.category}</div>
                <div className="mb-3 mt-0.5 font-serif text-[19px] font-semibold tracking-[-0.01em]">{r.dish}</div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-muted">Menuprijs</div>
                    <div className="text-[15px] font-semibold">{eur(r.menuPrice)}</div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold ${
                      crit ? "bg-danger-soft text-danger" : "bg-success-soft text-success"
                    }`}
                  >
                    {pct(r.marginPct)} marge
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
