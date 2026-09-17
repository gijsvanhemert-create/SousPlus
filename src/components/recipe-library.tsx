"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Heart, ChefHat, ArrowRight, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { eur, pct } from "@/lib/format";
import { marginChipClass } from "@/lib/margin";
import { toggleFavorite, deleteRecipe } from "@/server/menu-actions";
import { runDeleteRecipe } from "@/lib/recipe-delete";
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
  // Recept dat op bevestiging wacht om verwijderd te worden (null = geen dialoog).
  const [confirmTarget, setConfirmTarget] = useState<MenuItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, startDelete] = useTransition();

  const categories = ["Alle", ...Array.from(new Set(initialItems.map((i) => i.category)))];
  const shown = items.filter((r) => cat === "Alle" || r.category === cat);

  function onFavorite(id: string) {
    setItems((list) => list.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)));
    startTransition(async () => {
      await toggleFavorite({ recipeId: id });
    });
  }

  function onConfirmDelete() {
    const target = confirmTarget;
    if (!target) return;
    setDeleteError(null);
    const snapshot = items; // voor herstel bij een fout
    setItems((list) => list.filter((r) => r.id !== target.id)); // optimistisch verwijderen
    startDelete(async () => {
      await runDeleteRecipe(
        {
          del: deleteRecipe,
          onSuccess: () => {
            setConfirmTarget(null);
            router.refresh(); // hersynchroniseer met de server (versies/ingrediënten weg)
          },
          onError: (message) => {
            setItems(snapshot); // draai de optimistische verwijdering terug
            setDeleteError(message); // toon de ECHTE servermelding (bv. "in gebruik als component in …")
          },
        },
        target.id,
      );
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
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteError(null);
                    setConfirmTarget(r);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      setDeleteError(null);
                      setConfirmTarget(r);
                    }
                  }}
                  aria-label={`Verwijder ${r.dish}`}
                  className="absolute left-3 top-3 grid size-9 cursor-pointer place-items-center rounded-full border border-line bg-card text-muted opacity-0 transition hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 size={16} />
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
                  <span className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold ${marginChipClass(r.marginPct)}`}>
                    {r.marginPct != null ? `${pct(r.marginPct)} marge` : "n.v.t."}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bevestiging vóór definitief verwijderen — verwijdert ook alle versies + ingrediënten. */}
      {confirmTarget && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-charcoal/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Recept verwijderen"
          onClick={() => !deleting && setConfirmTarget(null)}
        >
          <div className="w-full max-w-md rounded-[18px] border border-line bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
                <AlertTriangle size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-[19px] font-semibold text-charcoal">Recept verwijderen?</h2>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">
                  Je staat op het punt <strong className="text-charcoal">{confirmTarget.dish}</strong> definitief te
                  verwijderen. Alle receptversies en hun ingrediënten worden mee verwijderd. Dit kan niet ongedaan
                  worden gemaakt.
                </p>
              </div>
            </div>

            {deleteError && <p className="mt-4 text-[13px] font-medium text-danger">{deleteError}</p>}

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setConfirmTarget(null)}
                disabled={deleting}
                className="rounded-lg border border-line bg-card px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-canvas disabled:opacity-50"
              >
                Annuleren
              </button>
              <button
                onClick={onConfirmDelete}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Definitief verwijderen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
