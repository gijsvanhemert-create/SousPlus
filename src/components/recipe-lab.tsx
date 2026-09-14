"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  GitBranch,
  Check,
  Eye,
  EyeOff,
  Minus,
  Plus,
  X,
  Boxes,
  Layers,
  ChevronRight,
  RefreshCw,
  PackageSearch,
  CheckCircle2,
  Loader2,
  ChefHat,
  BadgeCheck,
} from "lucide-react";
import { Decimal } from "decimal.js";
import { eur, pct } from "@/lib/format";
import { ingredientCost, recipeFoodcost } from "@/lib/cost";
import { computeVersionCosts, unitCostFor, type CostVersionNode } from "@/lib/component-cost";
import type { LabRecipe, LabVersion, CatalogResult, CandidateRecipe } from "@/types/recipe";
import {
  updateIngredientAmount,
  removeIngredient,
  addIngredientFromCatalog,
  setActiveVersion,
  searchCatalog,
  addComponent,
  updateComponentAmount,
  removeComponent,
  repointComponentToActive,
  searchRecipesForComponent,
} from "@/server/recipe-actions";

const SUP_COLOR: Record<string, string> = {
  HANOS: "text-info",
  SLIGRO: "text-success",
  BEIDE: "text-gold-deep",
};

/** Komma → punt; ongeldige/lege invoer telt als 0 voor de live berekening. */
function sanitize(value: string): string {
  const n = String(value).replace(",", ".");
  return /^\d*\.?\d*$/.test(n) && n !== "" && n !== "." ? n : "0";
}

/** Totale hoeveelheid voor N couverts, leesbaar weergegeven (mirror prototype). */
function fmtTotal(amount: string, covers: number, unit: string, isPiece: boolean): string {
  const total = Number(sanitize(amount)) * covers;
  if (isPiece) {
    const n = total % 1 === 0 ? String(total) : total.toFixed(1).replace(".", ",");
    return `× ${n} ${unit}`;
  }
  return total >= 1000
    ? `${(total / 1000).toFixed(2).replace(".", ",")} kg`
    : `${Math.round(total)} ${unit}`;
}

export function RecipeLab({
  recipes: initialRecipes,
  initialRecipeId,
}: {
  recipes: LabRecipe[];
  initialRecipeId?: string;
}) {
  // Lokale werkkopie, geseed uit props — instant herberekening bij het bewerken
  // van hoeveelheden. We syncen tijdens render (niet via een effect) zodra de
  // server na een mutatie nieuwe data doorgeeft: het aanbevolen patroon voor
  // "afgeleide state die soms reset".
  const [recipes, setRecipes] = useState(initialRecipes);
  const [prevInitial, setPrevInitial] = useState(initialRecipes);
  if (prevInitial !== initialRecipes) {
    setPrevInitial(initialRecipes);
    setRecipes(initialRecipes);
  }

  const [selectedRecipeId, setSelectedRecipeId] = useState(
    (initialRecipeId && initialRecipes.some((r) => r.id === initialRecipeId)
      ? initialRecipeId
      : initialRecipes[0]?.id) ?? "",
  );
  const [viewVersionByRecipe, setViewVersionByRecipe] = useState<Record<string, string>>({});
  const [covers, setCovers] = useState(12);
  const [kitchenView, setKitchenView] = useState(false);
  const [picker, setPicker] = useState(false);
  const [compPicker, setCompPicker] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Kosten per versie voor de hele locatie (incl. sub-componenten, recursief).
  // Herberekent live bij elke bewerking omdat `recipes` de werkkopie is.
  const versionCosts = useMemo(() => {
    const nodes: CostVersionNode[] = recipes.flatMap((r) =>
      r.versions.map((v) => ({
        id: v.id,
        yieldQty: sanitize(v.yieldQty),
        ingredients: v.ingredients.map((i) => ({
          catalogItemId: i.catalogItemId,
          amount: sanitize(i.amount),
          mode: i.mode,
          pricePerUnit: i.pricePerUnit,
        })),
        components: v.components.map((c) => ({ childVersionId: c.childVersionId, amount: sanitize(c.amount) })),
      })),
    );
    return computeVersionCosts(nodes);
  }, [recipes]);

  const recipe = recipes.find((r) => r.id === selectedRecipeId) ?? recipes[0];
  const versions = recipe?.versions ?? [];
  const versionId = recipe
    ? viewVersionByRecipe[recipe.id] ??
      recipe.activeVersionId ??
      versions[versions.length - 1]?.id ??
      ""
    : "";
  const version: LabVersion | undefined =
    versions.find((v) => v.id === versionId) ?? versions[versions.length - 1];

  // --- Live kostprijs/marge (fase-2 motor) — hook altijd onvoorwaardelijk aanroepen.
  const costing = useMemo(() => {
    if (!recipe || !version) return null;
    const foodcostPerCover = recipeFoodcost({
      ingredients: version.ingredients.map((i) => ({
        catalogItemId: i.catalogItemId,
        amount: sanitize(i.amount),
        mode: i.mode,
        pricePerUnit: i.pricePerUnit,
      })),
      // Componenten tellen mee via hun (recursief bepaalde) kost per eenheid.
      components: version.components.map((c) => ({
        amount: sanitize(c.amount),
        unitCost: unitCostFor(versionCosts, c.childVersionId),
      })),
    });
    // Marge is alleen gedefinieerd bij een positieve menuprijs; sub-recepten
    // kunnen €0 zijn (dan tonen we n.v.t. i.p.v. te crashen op recipeCost).
    const price = new Decimal(sanitize(recipe.menuPrice));
    const marginPct = price.gt(0) ? price.sub(foodcostPerCover).div(price).mul(100) : null;
    return { foodcostPerCover, foodcostTotal: foodcostPerCover.mul(covers), marginPct };
  }, [recipe, version, covers, versionCosts]);

  if (!recipe || !version || !costing) {
    return (
      <div className="rounded-2xl border border-line bg-card p-8">
        <h1 className="font-serif text-2xl font-semibold text-charcoal">Recipe Lab</h1>
        <p className="mt-3 text-[15px] text-ink">
          Nog geen recepturen voor deze locatie. Seed de demo-data of voeg een gerecht toe.
        </p>
      </div>
    );
  }

  const currentVersionId = version.id; // genarrowd; veilig in closures
  const isActiveVersion = recipe.activeVersionId === currentVersionId;
  const marginCritical = costing.marginPct != null && costing.marginPct.lt(70);

  function selectVersion(id: string) {
    setViewVersionByRecipe((m) => ({ ...m, [recipe.id]: id }));
  }

  function setLocalAmount(ingId: string, value: string) {
    setRecipes((rs) =>
      rs.map((r) =>
        r.id !== recipe.id
          ? r
          : {
              ...r,
              versions: r.versions.map((v) =>
                v.id !== currentVersionId
                  ? v
                  : {
                      ...v,
                      ingredients: v.ingredients.map((i) =>
                        i.id === ingId ? { ...i, amount: value } : i,
                      ),
                    },
              ),
            },
      ),
    );
  }

  function persistAmount(ingId: string, value: string) {
    startTransition(async () => {
      await updateIngredientAmount({ ingredientId: ingId, amount: sanitize(value) });
    });
  }

  function onRemove(ingId: string) {
    // Optimistisch verwijderen; de server bevestigt via revalidate.
    setLocalRemove(ingId);
    startTransition(async () => {
      await removeIngredient({ ingredientId: ingId });
    });
  }
  function setLocalRemove(ingId: string) {
    setRecipes((rs) =>
      rs.map((r) =>
        r.id !== recipe.id
          ? r
          : {
              ...r,
              versions: r.versions.map((v) =>
                v.id !== currentVersionId
                  ? v
                  : { ...v, ingredients: v.ingredients.filter((i) => i.id !== ingId) },
              ),
            },
      ),
    );
  }

  function onAddFromCatalog(item: CatalogResult) {
    startTransition(async () => {
      await addIngredientFromCatalog({ versionId: currentVersionId, catalogItemId: item.id });
    });
  }

  function promoteVersion() {
    startTransition(async () => {
      await setActiveVersion({ recipeId: recipe.id, versionId: currentVersionId });
    });
  }

  // --- Componenten -----------------------------------------------------------
  function updateLocalComponent(compId: string, patch: { amount: string }) {
    setRecipes((rs) =>
      rs.map((r) =>
        r.id !== recipe.id
          ? r
          : {
              ...r,
              versions: r.versions.map((v) =>
                v.id !== currentVersionId
                  ? v
                  : { ...v, components: v.components.map((c) => (c.id === compId ? { ...c, ...patch } : c)) },
              ),
            },
      ),
    );
  }
  function persistComponentAmount(compId: string, value: string) {
    startTransition(async () => {
      await updateComponentAmount({ componentId: compId, amount: sanitize(value) });
    });
  }
  function onRemoveComponent(compId: string) {
    setRecipes((rs) =>
      rs.map((r) =>
        r.id !== recipe.id
          ? r
          : {
              ...r,
              versions: r.versions.map((v) =>
                v.id !== currentVersionId ? v : { ...v, components: v.components.filter((c) => c.id !== compId) },
              ),
            },
      ),
    );
    startTransition(async () => {
      await removeComponent({ componentId: compId });
    });
  }
  function onAddComponent(childRecipeId: string) {
    startTransition(async () => {
      await addComponent({ parentVersionId: currentVersionId, childRecipeId });
    });
  }
  function onRepointComponent(compId: string) {
    startTransition(async () => {
      await repointComponentToActive({ componentId: compId });
    });
  }
  // Open de component in zijn eigen weergave, op de gepinde versie.
  function openComponent(childRecipeId: string, childVersionId: string) {
    setViewVersionByRecipe((m) => ({ ...m, [childRecipeId]: childVersionId }));
    setSelectedRecipeId(childRecipeId);
  }

  return (
    <div>
      {/* Hero */}
      <div className="mb-[22px] flex flex-wrap items-center gap-[26px] rounded-[20px] border border-line bg-card p-6">
        <div className="grid size-[132px] shrink-0 place-items-center rounded-[18px] bg-gradient-to-br from-champagne to-canvas text-gold-deep">
          <ChefHat size={54} strokeWidth={1.3} />
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              Signatuur · {recipe.category}
            </span>
            <span className="size-1 rounded-full bg-line" />
            <span className="text-[11px] text-muted">
              {version.label} · {version.name}
            </span>
            {isActiveVersion && (
              <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2 py-0.5 text-[10.5px] font-semibold text-success">
                <BadgeCheck size={12} /> Op de kaart
              </span>
            )}
          </div>
          {recipes.length > 1 ? (
            <select
              value={recipe.id}
              onChange={(e) => setSelectedRecipeId(e.target.value)}
              aria-label="Kies gerecht"
              className="-ml-1 max-w-full cursor-pointer rounded-lg border border-transparent bg-transparent px-1 py-0.5 font-serif text-[32px] font-semibold leading-tight tracking-[-0.02em] text-charcoal hover:border-line"
            >
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.dish}
                </option>
              ))}
            </select>
          ) : (
            <h1 className="font-serif text-[34px] font-semibold leading-tight tracking-[-0.02em]">
              {recipe.dish}
            </h1>
          )}
          {version.note && (
            <p className="mt-2.5 max-w-[560px] text-sm leading-relaxed text-ink">{version.note}</p>
          )}
        </div>
        <button
          onClick={() => setKitchenView((k) => !k)}
          className={`flex shrink-0 cursor-pointer items-center gap-2 self-start rounded-xl border px-3.5 py-2.5 text-[13px] font-semibold transition ${
            kitchenView
              ? "border-forest bg-forest text-white"
              : "border-line bg-card text-ink hover:border-gold"
          }`}
        >
          {kitchenView ? <EyeOff size={16} /> : <Eye size={16} />} Kitchen View
        </button>
      </div>

      {/* Statistieken */}
      <div
        className="mb-[22px] grid gap-3.5"
        style={{ gridTemplateColumns: `repeat(${kitchenView ? 2 : 4}, minmax(0, 1fr))` }}
      >
        <StatChip label="Prep tijd" value={`${version.prepTimeMin} min`} />
        {!kitchenView && (
          <StatChip label="Foodcost p.c." value={eur(costing.foodcostPerCover.toNumber())} testId="lab-foodcost" />
        )}
        {!kitchenView && (
          <StatChip
            label="Marge"
            value={costing.marginPct != null ? pct(costing.marginPct.toNumber()) : "n.v.t."}
            accent={costing.marginPct == null ? "text-muted" : marginCritical ? "text-danger" : "text-success"}
            testId="lab-margin"
          />
        )}
        <StatChip label="Live status" value={kitchenView ? "Service" : "Synced"} accent="text-gold" />
      </div>

      {kitchenView && (
        <div className="mb-[22px] flex items-center gap-2 rounded-xl border border-champagne bg-champagne-soft px-4 py-2.5 text-[12.5px] font-semibold text-gold-deep">
          <EyeOff size={15} /> Kitchen View actief — financiële data verborgen voor de pas.
        </div>
      )}

      <div className="grid items-start gap-[22px] min-[900px]:grid-cols-[1.4fr_1fr]">
        {/* Links: versiebeheer + bereidingswijze */}
        <div>
          <div className="mb-[22px] rounded-[18px] border border-line bg-card p-[22px]">
            <div className="mb-5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <GitBranch size={16} className="text-gold" />
                <span className="font-serif text-base font-semibold">Culinair Versiebeheer</span>
              </div>
              {!isActiveVersion && (
                <button
                  onClick={promoteVersion}
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gold bg-champagne-soft px-3 py-1.5 text-[12px] font-semibold text-gold-deep transition hover:bg-champagne disabled:opacity-60"
                >
                  <BadgeCheck size={14} /> Maak actief
                </button>
              )}
            </div>
            <div className="relative flex justify-between overflow-x-auto px-1.5">
              <div className="absolute left-[18px] right-[18px] top-[13px] z-0 h-0.5 bg-line" />
              {recipe.versions.map((v) => {
                const on = v.id === version.id;
                return (
                  <button
                    key={v.id}
                    onClick={() => selectVersion(v.id)}
                    className="relative z-10 flex flex-[1_0_auto] min-w-16 cursor-pointer flex-col items-center gap-2.5 bg-transparent"
                  >
                    <span
                      className={`grid size-7 place-items-center rounded-full border-2 text-[11px] font-semibold ${
                        on
                          ? "border-gold bg-gold text-white shadow-[0_0_0_5px_var(--color-champagne-soft)]"
                          : "border-line bg-card text-muted"
                      }`}
                    >
                      {on ? <Check size={14} /> : v.label.replace("v", "")}
                    </span>
                    <span
                      className={`text-[12.5px] ${on ? "font-bold text-charcoal" : "font-medium text-muted"}`}
                    >
                      {v.label}
                    </span>
                    <span className="text-[11px] text-muted">{v.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {version.steps.length > 0 && (
            <div className="rounded-[18px] border border-line bg-card p-[22px]">
              <div className="mb-4 font-serif text-base font-semibold">Bereidingswijze</div>
              <ol className="flex flex-col gap-3.5">
                {version.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-3.5">
                    <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-champagne-soft font-serif text-[12.5px] font-bold text-gold-deep">
                      {i + 1}
                    </span>
                    <span className="pt-0.5 text-[14.5px] leading-relaxed text-ink">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Rechts: portionering + mise en place */}
        <div>
          <div className="mb-[22px] rounded-[18px] border border-line bg-card p-[22px]">
            <div className="mb-3 text-[11px] uppercase tracking-[0.1em] text-muted">
              Couverts / Portionering
            </div>
            <div className="flex items-center gap-3.5">
              <button
                onClick={() => setCovers((c) => Math.max(1, c - 1))}
                aria-label="Minder"
                className="grid size-[42px] cursor-pointer place-items-center rounded-xl border border-line bg-canvas text-charcoal"
              >
                <Minus size={18} />
              </button>
              <div className="flex-1 text-center">
                <div className="font-serif text-[40px] font-semibold leading-none">{covers}</div>
                <div className="mt-1 text-[11.5px] text-muted">covers vanavond</div>
              </div>
              <button
                onClick={() => setCovers((c) => Math.min(200, c + 1))}
                aria-label="Meer"
                className="grid size-[42px] cursor-pointer place-items-center rounded-xl border border-line bg-canvas text-charcoal"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="mt-3.5 flex gap-2">
              {[10, 25, 50, 85].map((n) => (
                <button
                  key={n}
                  onClick={() => setCovers(n)}
                  className={`flex-1 rounded-[9px] border py-[7px] text-xs font-semibold ${
                    covers === n
                      ? "border-gold bg-champagne-soft text-gold-deep"
                      : "border-line bg-card text-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[18px] border border-line bg-card p-[22px]">
            <div className="mb-3.5 flex items-baseline justify-between">
              <span className="font-serif text-base font-semibold">Mise en place</span>
              <span className="text-[11.5px] text-muted">per couvert</span>
            </div>

            {version.ingredients.map((ing) => {
              const isPiece = ing.mode === "PIECE";
              const lineCost = ingredientCost({
                amount: sanitize(ing.amount),
                mode: ing.mode,
                pricePerUnit: ing.pricePerUnit,
              })
                .mul(covers)
                .toNumber();
              const totalDisp = fmtTotal(ing.amount, covers, ing.unit, isPiece);
              return (
                <div
                  key={ing.id}
                  className="flex items-center justify-between gap-2 border-b border-canvas py-[9px]"
                >
                  <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink">{ing.name}</span>
                  <div className="flex shrink-0 items-center gap-2.5">
                    {!kitchenView && (
                      <span className="flex items-center gap-1">
                        <input
                          value={ing.amount}
                          onChange={(e) => setLocalAmount(ing.id, e.target.value)}
                          onBlur={(e) => persistAmount(ing.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          inputMode="decimal"
                          aria-label={`hoeveelheid ${ing.name}`}
                          className="w-[50px] rounded-lg border border-line bg-canvas px-[7px] py-[5px] text-center text-[13px] text-charcoal tabular-nums"
                        />
                        <span className="w-6 text-[11.5px] text-muted">{ing.unit}</span>
                      </span>
                    )}
                    {kitchenView && (
                      <span className="text-[13.5px] font-semibold tabular-nums">{totalDisp}</span>
                    )}
                    {!kitchenView && (
                      <span className="w-16 text-right text-[11px] text-muted tabular-nums">
                        {totalDisp}
                      </span>
                    )}
                    {!kitchenView && (
                      <span className="w-[52px] text-right text-[12.5px] text-muted tabular-nums">
                        {eur(lineCost)}
                      </span>
                    )}
                    {!kitchenView && (
                      <button
                        onClick={() => onRemove(ing.id)}
                        aria-label={`Verwijder ${ing.name}`}
                        className="grid size-6 cursor-pointer place-items-center rounded-[7px] text-muted transition hover:bg-danger-soft hover:text-danger"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {version.ingredients.length === 0 && (
              <div className="py-6 text-center text-[13px] text-muted">
                Nog geen ingrediënten — voeg er een toe uit de catalogus.
              </div>
            )}

            {!kitchenView && (
              <button
                onClick={() => setPicker(true)}
                className="mt-3.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-dashed border-gold bg-champagne-soft px-3.5 py-2.5 text-[13px] font-semibold text-gold-deep transition hover:bg-champagne"
              >
                <Plus size={16} /> Ingrediënt uit catalogus
              </button>
            )}
            {!kitchenView && (
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3.5">
                <span className="text-[13px] text-muted">Totale inkoop voor {covers} covers</span>
                <span className="font-serif text-[22px] font-semibold">
                  {eur(costing.foodcostTotal.toNumber())}
                </span>
              </div>
            )}
          </div>

          {/* Componenten / sub-recepten */}
          {(version.components.length > 0 || !kitchenView) && (
            <div className="mt-[22px] rounded-[18px] border border-line bg-card p-[22px]">
              <div className="mb-3.5 flex items-baseline justify-between">
                <span className="flex items-center gap-2 font-serif text-base font-semibold">
                  <Layers size={16} className="text-gold" /> Componenten
                </span>
                <span className="text-[11.5px] text-muted">sub-recepten</span>
              </div>

              {version.components.map((c) => {
                const isPiece = c.mode === "PIECE";
                const lineCost = unitCostFor(versionCosts, c.childVersionId)
                  .mul(sanitize(c.amount))
                  .mul(covers)
                  .toNumber();
                const totalDisp = fmtTotal(c.amount, covers, c.unit, isPiece);
                const stale = !!c.childActiveVersionId && c.childActiveVersionId !== c.childVersionId;
                return (
                  <div key={c.id} className="border-b border-canvas py-[9px]">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => openComponent(c.childRecipeId, c.childVersionId)}
                        className="group/comp flex min-w-0 flex-1 items-center gap-1.5 text-left"
                        aria-label={`Open ${c.name}`}
                      >
                        <span className="truncate text-[13.5px] font-medium text-ink transition group-hover/comp:text-gold-deep">
                          {c.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-champagne-soft px-1.5 py-0.5 text-[10px] font-semibold text-gold-deep">
                          {c.versionLabel}
                        </span>
                        <ChevronRight size={13} className="shrink-0 text-muted transition group-hover/comp:text-gold-deep" />
                      </button>
                      <div className="flex shrink-0 items-center gap-2.5">
                        {!kitchenView && (
                          <span className="flex items-center gap-1">
                            <input
                              value={c.amount}
                              onChange={(e) => updateLocalComponent(c.id, { amount: e.target.value })}
                              onBlur={(e) => persistComponentAmount(c.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              }}
                              inputMode="decimal"
                              aria-label={`hoeveelheid ${c.name}`}
                              className="w-[50px] rounded-lg border border-line bg-canvas px-[7px] py-[5px] text-center text-[13px] text-charcoal tabular-nums"
                            />
                            <span className="w-6 text-[11.5px] text-muted">{c.unit}</span>
                          </span>
                        )}
                        {kitchenView && <span className="text-[13.5px] font-semibold tabular-nums">{totalDisp}</span>}
                        {!kitchenView && (
                          <span className="w-16 text-right text-[11px] text-muted tabular-nums">{totalDisp}</span>
                        )}
                        {!kitchenView && (
                          <span className="w-[52px] text-right text-[12.5px] text-muted tabular-nums">{eur(lineCost)}</span>
                        )}
                        {!kitchenView && (
                          <button
                            onClick={() => onRemoveComponent(c.id)}
                            aria-label={`Verwijder ${c.name}`}
                            className="grid size-6 cursor-pointer place-items-center rounded-[7px] text-muted transition hover:bg-danger-soft hover:text-danger"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    {stale && !kitchenView && (
                      <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                        <span className="text-muted">Nieuwere versie beschikbaar.</span>
                        <button
                          onClick={() => onRepointComponent(c.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-full border border-gold px-2 py-0.5 font-semibold text-gold-deep transition hover:bg-champagne-soft disabled:opacity-60"
                        >
                          <RefreshCw size={11} /> bijwerken
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}

              {version.components.length === 0 && (
                <div className="py-4 text-center text-[13px] text-muted">
                  Nog geen componenten — voeg een bestaand recept toe als sub-recept.
                </div>
              )}

              {!kitchenView && (
                <button
                  onClick={() => setCompPicker(true)}
                  className="mt-3.5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-[11px] border border-dashed border-gold bg-champagne-soft px-3.5 py-2.5 text-[13px] font-semibold text-gold-deep transition hover:bg-champagne"
                >
                  <Plus size={16} /> Component uit recepten
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {picker && (
        <CatalogPicker
          presentIds={new Set(version.ingredients.map((i) => i.catalogItemId).filter(Boolean) as string[])}
          pending={isPending}
          onAdd={onAddFromCatalog}
          onClose={() => setPicker(false)}
        />
      )}

      {compPicker && (
        <RecipePicker
          parentRecipeId={recipe.id}
          presentIds={new Set(version.components.map((c) => c.childRecipeId))}
          pending={isPending}
          onAdd={(id) => onAddComponent(id)}
          onClose={() => setCompPicker(false)}
        />
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  accent = "text-charcoal",
  testId,
}: {
  label: string;
  value: string;
  accent?: string;
  testId?: string;
}) {
  return (
    <div className="rounded-[14px] border border-line bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div data-testid={testId} className={`mt-1 font-serif text-[22px] font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
    </div>
  );
}

function CatalogPicker({
  presentIds,
  pending,
  onAdd,
  onClose,
}: {
  presentIds: Set<string>;
  pending: boolean;
  onAdd: (item: CatalogResult) => void;
  onClose: () => void;
}) {
  const [pq, setPq] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [searching, setSearching] = useState(true);

  // Zet de laad-indicator tijdens render zodra de zoekterm wijzigt (geen
  // synchrone setState in de effect-body); de fetch zelf gebeurt debounced.
  const [prevPq, setPrevPq] = useState<string | null>(null);
  if (pq !== prevPq) {
    setPrevPq(pq);
    setSearching(true);
  }

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      const r = await searchCatalog(pq);
      if (active) {
        setResults(r);
        setSearching(false);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [pq]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(14,26,18,0.45)] p-4 backdrop-blur-[2px] [animation:sp-fade_.2s_ease]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[82vh] w-[540px] max-w-full flex-col overflow-hidden rounded-[18px] border border-line bg-card shadow-[0_24px_60px_rgba(21,39,28,.28)]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Boxes size={17} className="text-gold" />
            <span className="font-serif text-base font-semibold">Catalogus</span>
          </div>
          <button onClick={onClose} aria-label="Sluiten" className="cursor-pointer text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="border-b border-line p-4">
          <div className="relative">
            <PackageSearch size={17} className="absolute left-3.5 top-3 text-muted" />
            <input
              autoFocus
              value={pq}
              onChange={(e) => setPq(e.target.value)}
              placeholder="Zoek een ingrediënt of categorie…"
              className="w-full rounded-xl border border-line bg-canvas py-2.5 pl-10 pr-3.5 text-[14.5px] text-charcoal"
            />
          </div>
        </div>
        <div className="overflow-y-auto py-1.5">
          {searching && (
            <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
              <Loader2 size={15} className="animate-spin" /> Catalogus doorzoeken…
            </div>
          )}
          {!searching &&
            results.map((it) => {
              const added = presentIds.has(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => !added && onAdd(it)}
                  disabled={added || pending}
                  className="flex w-full items-center justify-between gap-2.5 border-b border-canvas px-5 py-2.5 text-left transition enabled:hover:bg-canvas disabled:cursor-default"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-charcoal">
                      {it.name}
                    </span>
                    <span className="text-[11.5px] text-muted">
                      {it.category} · <span className={SUP_COLOR[it.supplier] ?? "text-gold-deep"}>{it.supplier}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-[13.5px] font-semibold tabular-nums">
                      {eur(Number(it.price))}
                      <span className="text-[11px] font-normal text-muted">/{it.unit}</span>
                    </span>
                    {added ? (
                      <CheckCircle2 size={18} className="text-success" />
                    ) : (
                      <Plus size={18} className="text-gold" />
                    )}
                  </span>
                </button>
              );
            })}
          {!searching && results.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted">Geen artikelen gevonden.</div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-xs text-muted">
            Toegevoegde ingrediënten rekenen direct mee in de marge.
          </span>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-[10px] bg-forest px-4.5 py-2 text-[13px] font-semibold text-white"
          >
            Klaar
          </button>
        </div>
      </div>
    </div>
  );
}

function RecipePicker({
  parentRecipeId,
  presentIds,
  pending,
  onAdd,
  onClose,
}: {
  parentRecipeId: string;
  presentIds: Set<string>;
  pending: boolean;
  onAdd: (childRecipeId: string) => void;
  onClose: () => void;
}) {
  const [pq, setPq] = useState("");
  const [results, setResults] = useState<CandidateRecipe[]>([]);
  const [searching, setSearching] = useState(true);

  const [prevPq, setPrevPq] = useState<string | null>(null);
  if (pq !== prevPq) {
    setPrevPq(pq);
    setSearching(true);
  }

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      const r = await searchRecipesForComponent(pq, parentRecipeId);
      if (active) {
        setResults(r);
        setSearching(false);
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [pq, parentRecipeId]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] grid place-items-center bg-[rgba(14,26,18,0.45)] p-4 backdrop-blur-[2px] [animation:sp-fade_.2s_ease]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[82vh] w-[540px] max-w-full flex-col overflow-hidden rounded-[18px] border border-line bg-card shadow-[0_24px_60px_rgba(21,39,28,.28)]"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Layers size={17} className="text-gold" />
            <span className="font-serif text-base font-semibold">Component uit recepten</span>
          </div>
          <button onClick={onClose} aria-label="Sluiten" className="cursor-pointer text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="border-b border-line p-4">
          <div className="relative">
            <PackageSearch size={17} className="absolute left-3.5 top-3 text-muted" />
            <input
              autoFocus
              value={pq}
              onChange={(e) => setPq(e.target.value)}
              placeholder="Zoek een bestaand recept…"
              className="w-full rounded-xl border border-line bg-canvas py-2.5 pl-10 pr-3.5 text-[14.5px] text-charcoal"
            />
          </div>
        </div>
        <div className="overflow-y-auto py-1.5">
          {searching && (
            <div className="flex items-center justify-center gap-2 py-8 text-[13px] text-muted">
              <Loader2 size={15} className="animate-spin" /> Recepten doorzoeken…
            </div>
          )}
          {!searching &&
            results.map((it) => {
              const added = presentIds.has(it.id);
              return (
                <button
                  key={it.id}
                  onClick={() => !added && onAdd(it.id)}
                  disabled={added || pending}
                  className="flex w-full items-center justify-between gap-2.5 border-b border-canvas px-5 py-2.5 text-left transition enabled:hover:bg-canvas disabled:cursor-default"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-charcoal">{it.dish}</span>
                    <span className="text-[11.5px] text-muted">
                      {it.category} · actieve versie {it.versionLabel}
                    </span>
                  </span>
                  {added ? (
                    <CheckCircle2 size={18} className="shrink-0 text-success" />
                  ) : (
                    <Plus size={18} className="shrink-0 text-gold" />
                  )}
                </button>
              );
            })}
          {!searching && results.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted">Geen geschikte recepten gevonden.</div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-3">
          <span className="text-xs text-muted">Componenten rekenen direct mee in de marge.</span>
          <button
            onClick={onClose}
            className="cursor-pointer rounded-[10px] bg-forest px-4.5 py-2 text-[13px] font-semibold text-white"
          >
            Klaar
          </button>
        </div>
      </div>
    </div>
  );
}
