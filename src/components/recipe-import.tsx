"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, FileText, ScanText, Loader2, Plus, X, AlertTriangle, Check, Link2, CircleAlert } from "lucide-react";
import { ALLOWED_UPLOAD_TYPES, fileToBase64, resizeImage } from "@/lib/image-upload";
import { scanRecipeFileAction, saveScannedRecipeAction } from "@/server/recipe-ocr-actions";
import type { ScannedRecipe } from "@/server/recipe-ocr";

type Selected = { kind: "image" | "pdf"; mediaType: string; data: string; name: string; preview: string | null };

type Ingr = {
  name: string;
  amountText: string;
  unit: string;
  mode: "WEIGHT" | "PIECE";
  matchedId: string | null;
  matchedName: string | null;
  pricePerUnit: number | null;
};

type Review = {
  dish: string;
  category: string;
  servesText: string;
  portionBasis: "per_person" | "total";
  menuPriceText: string;
  ingredients: Ingr[];
  steps: string[];
  warnings: string[];
};

// Hoeveelheid uit een tekstveld: komma → punt, moet een eindig getal > 0 zijn.
// null = ongeldig/leeg (blokkeert opslaan; nooit een verborgen 0 — zie fase 2).
function parseAmount(text: string): number | null {
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toReview(r: ScannedRecipe): Review {
  return {
    dish: r.dish,
    category: r.category ?? "",
    servesText: r.serves != null ? String(r.serves) : "",
    // Handgeschreven recepten met "voor N personen" vermelden meestal totalen.
    portionBasis: r.serves != null && r.serves > 1 ? "total" : "per_person",
    menuPriceText: "",
    ingredients: r.ingredients.map((i) => ({
      name: i.name,
      amountText: i.amount != null ? String(i.amount) : "",
      unit: i.storageUnit,
      mode: i.mode,
      matchedId: i.matchedId,
      matchedName: i.matchedName,
      pricePerUnit: i.pricePerUnit,
    })),
    steps: r.steps.length ? r.steps : [""],
    warnings: r.warnings,
  };
}

export function RecipeImport() {
  const router = useRouter();
  const [selected, setSelected] = useState<Selected | null>(null);
  const [stage, setStage] = useState<"idle" | "scanning" | "review">("idle");
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) {
      setSelected(null);
      setError("Alleen JPG, PNG, WebP of PDF wordt ondersteund.");
      return;
    }
    try {
      if (file.type === "application/pdf") {
        const data = await fileToBase64(file);
        setSelected({ kind: "pdf", mediaType: "application/pdf", data, name: file.name, preview: null });
      } else {
        const { data, preview } = await resizeImage(file);
        setSelected({ kind: "image", mediaType: "image/jpeg", data, name: file.name, preview });
      }
    } catch {
      setSelected(null);
      setError("Kon het bestand niet verwerken. Probeer een andere foto of PDF.");
    }
  }

  function scan() {
    if (stage === "scanning" || !selected) return;
    setStage("scanning");
    setError(null);
    setSaveError(null);
    startTransition(async () => {
      try {
        const res = await scanRecipeFileAction({ kind: selected.kind, mediaType: selected.mediaType, data: selected.data });
        if (!res.recipe) {
          setError("Geen recept herkend. Maak een scherpere foto (recht van boven, goed licht) of upload de PDF.");
          setStage("idle");
          return;
        }
        setReview(toReview(res.recipe));
        setStage("review");
      } catch {
        setError("Scannen mislukt. Probeer het opnieuw of gebruik een andere foto/PDF.");
        setStage("idle");
      }
    });
  }

  function patchIngr(i: number, next: Partial<Ingr>) {
    setReview((r) => (r ? { ...r, ingredients: r.ingredients.map((x, idx) => (idx === i ? { ...x, ...next } : x)) } : r));
  }
  function removeIngr(i: number) {
    setReview((r) => (r ? { ...r, ingredients: r.ingredients.filter((_, idx) => idx !== i) } : r));
  }
  function addIngr() {
    setReview((r) =>
      r
        ? { ...r, ingredients: [...r.ingredients, { name: "", amountText: "", unit: "g", mode: "WEIGHT", matchedId: null, matchedName: null, pricePerUnit: null }] }
        : r,
    );
  }
  function patchStep(i: number, value: string) {
    setReview((r) => (r ? { ...r, steps: r.steps.map((s, idx) => (idx === i ? value : s)) } : r));
  }
  function removeStep(i: number) {
    setReview((r) => (r ? { ...r, steps: r.steps.filter((_, idx) => idx !== i) } : r));
  }
  function addStep() {
    setReview((r) => (r ? { ...r, steps: [...r.steps, ""] } : r));
  }

  // Validatie (fase-3-blokkade): elk ingrediënt moet een hoeveelheid > 0 hebben,
  // en er is een naam. Zo belandt een onbekende hoeveelheid nooit als stille 0.
  const invalidAmount = review ? review.ingredients.map((i) => parseAmount(i.amountText) === null) : [];
  const anyInvalidAmount = invalidAmount.some(Boolean);
  const missingName = review ? review.ingredients.some((i) => i.name.trim() === "") : false;
  const canSave =
    !!review && review.dish.trim() !== "" && review.ingredients.length > 0 && !anyInvalidAmount && !missingName;

  function save() {
    if (!review || !canSave) return;
    setSaveError(null);
    const payload = {
      dish: review.dish.trim(),
      category: review.category.trim() || undefined,
      serves: review.servesText.trim() ? Math.trunc(Number(review.servesText)) || null : null,
      portionBasis: review.portionBasis,
      menuPrice: review.menuPriceText.trim() ? Number(review.menuPriceText.replace(",", ".")) : undefined,
      ingredients: review.ingredients.map((i) => ({
        name: i.name.trim(),
        amount: parseAmount(i.amountText),
        unit: i.unit.trim() || (i.mode === "PIECE" ? "stuk" : "g"),
        mode: i.mode,
        catalogItemId: i.matchedId,
        pricePerUnit: i.pricePerUnit,
      })),
      steps: review.steps.map((s) => s.trim()).filter(Boolean),
    };
    startTransition(async () => {
      try {
        const res = await saveScannedRecipeAction(payload);
        if (!res.ok) {
          setSaveError(res.error);
          return;
        }
        router.push(`/lab?recipe=${res.recipeId}`);
      } catch {
        setSaveError("Opslaan mislukt door een onverwachte fout. Probeer het opnieuw.");
      }
    });
  }

  return (
    <div className="max-w-[860px]">
      <p className="mb-5 mt-0 max-w-[600px] text-[14.5px] leading-relaxed text-ink">
        Fotografeer een bestaand recept (handgeschreven of geprint) of upload een PDF — de AI leest naam, ingrediënten met
        hoeveelheden en de bereidingswijze uit. Controleer en corrigeer alles, en sla het dan op in de Recipe Lab. Er wordt
        niets opgeslagen tot je op bewerken bevestigt.
      </p>

      {stage !== "review" && (
        <div className="rounded-[18px] border border-line bg-card p-5">
          <div className="relative mb-3.5 overflow-hidden rounded-[14px] border-2 border-dashed border-line bg-canvas px-4.5 py-6 text-center">
            {stage === "scanning" && (
              <div className="absolute left-0 right-0 h-0.5 bg-gold shadow-[0_0_12px_var(--color-gold)] [animation:sp-scan_1.4s_linear_infinite]" />
            )}
            {selected?.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.preview} alt="Voorbeeld" className="mx-auto max-h-52 rounded-lg object-contain" />
            ) : selected ? (
              <div className="flex items-center justify-center gap-2 py-6 text-[13.5px] text-ink">
                <FileText size={18} className="text-gold-deep" /> {selected.name}
              </div>
            ) : (
              <div className="py-6 text-[13px] text-muted">Nog geen foto of PDF gekozen.</div>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              onClick={() => uploadRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink transition hover:border-gold"
            >
              <Upload size={16} /> Upload
            </button>
            <button
              onClick={() => cameraRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-xl border border-line bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink transition hover:border-gold"
            >
              <Camera size={16} /> Foto maken
            </button>
            <button
              onClick={scan}
              disabled={!selected || stage === "scanning"}
              className="ml-auto inline-flex items-center gap-2 rounded-xl border border-forest bg-forest px-4 py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60"
            >
              {stage === "scanning" ? <Loader2 size={16} className="animate-spin" /> : <ScanText size={16} />} Recept uitlezen
            </button>
          </div>

          <input
            ref={uploadRef}
            type="file"
            accept={ALLOWED_UPLOAD_TYPES.join(",")}
            className="hidden"
            data-testid="recipe-file-input"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />

          {error && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
            </div>
          )}
        </div>
      )}

      {stage === "review" && review && (
        <div className="flex flex-col gap-4">
          {review.warnings.length > 0 && (
            <div className="rounded-[14px] border border-champagne bg-champagne-soft px-4 py-3 text-[12.5px] leading-relaxed text-gold-deep">
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                <CircleAlert size={14} /> Let op — de AI markeerde onzekerheden:
              </div>
              <ul className="list-disc pl-5">
                {review.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Kop: naam, categorie, porties, prijs */}
          <div className="rounded-[18px] border border-line bg-card p-4">
            <label className="mb-1 block text-[11px] uppercase tracking-[0.08em] text-muted">Gerecht</label>
            <input
              value={review.dish}
              onChange={(e) => setReview({ ...review, dish: e.target.value })}
              placeholder="Naam van het gerecht"
              className="mb-3 w-full rounded-lg border border-line bg-canvas px-3 py-2 font-serif text-[20px] font-semibold text-charcoal"
            />
            <div className="grid gap-3 min-[560px]:grid-cols-4">
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                Categorie
                <input value={review.category} onChange={(e) => setReview({ ...review, category: e.target.value })} placeholder="Overig" className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] normal-case text-charcoal" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                Voor N personen
                <input value={review.servesText} onChange={(e) => setReview({ ...review, servesText: e.target.value })} inputMode="numeric" placeholder="—" className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-charcoal tabular-nums" />
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                Hoeveelheden zijn
                <select value={review.portionBasis} onChange={(e) => setReview({ ...review, portionBasis: e.target.value as Review["portionBasis"] })} className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] normal-case text-charcoal">
                  <option value="total">totaal voor N pers.</option>
                  <option value="per_person">per persoon</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                Verkoopprijs (optioneel)
                <input value={review.menuPriceText} onChange={(e) => setReview({ ...review, menuPriceText: e.target.value })} inputMode="decimal" placeholder="€ —" className="rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] text-charcoal tabular-nums" />
              </label>
            </div>
            {review.portionBasis === "total" && review.servesText.trim() !== "" && (
              <p className="mt-2 text-[11.5px] text-muted">
                De hoeveelheden worden bij opslaan door {review.servesText || "N"} gedeeld naar per couvert.
              </p>
            )}
          </div>

          {/* Ingrediënten */}
          <div className="rounded-[18px] border border-line bg-card p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-serif text-base font-semibold">Ingrediënten</span>
              <span className="text-[11.5px] text-muted">hoeveelheid · eenheid · koppeling</span>
            </div>
            <div className="flex flex-col">
              {review.ingredients.map((ing, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 border-t border-canvas py-2 first:border-t-0">
                  <input
                    value={ing.name}
                    onChange={(e) => patchIngr(i, { name: e.target.value })}
                    placeholder="Ingrediënt"
                    aria-label={`naam ingrediënt ${i + 1}`}
                    className={`min-w-0 flex-1 rounded-lg border bg-canvas px-2.5 py-1.5 text-[13px] text-charcoal ${ing.name.trim() === "" ? "border-danger" : "border-line"}`}
                  />
                  <input
                    value={ing.amountText}
                    onChange={(e) => patchIngr(i, { amountText: e.target.value })}
                    placeholder="?"
                    inputMode="decimal"
                    aria-label={`hoeveelheid ${ing.name || i + 1}`}
                    title={invalidAmount[i] ? "Vul een hoeveelheid in of verwijder het ingrediënt." : undefined}
                    className={`w-[66px] rounded-lg border bg-canvas px-2 py-1.5 text-right text-[13px] text-charcoal tabular-nums ${invalidAmount[i] ? "border-danger bg-danger-soft" : "border-line"}`}
                  />
                  <input
                    value={ing.unit}
                    onChange={(e) => patchIngr(i, { unit: e.target.value })}
                    aria-label={`eenheid ${ing.name || i + 1}`}
                    className="w-[56px] rounded-lg border border-line bg-canvas px-2 py-1.5 text-[13px] text-charcoal"
                  />
                  <select
                    value={ing.mode}
                    onChange={(e) => patchIngr(i, { mode: e.target.value as Ingr["mode"] })}
                    aria-label={`type ${ing.name || i + 1}`}
                    className="rounded-lg border border-line bg-canvas px-2 py-1.5 text-[12px] text-charcoal"
                  >
                    <option value="WEIGHT">gewicht</option>
                    <option value="PIECE">stuk</option>
                  </select>
                  <span className="inline-flex min-w-[128px] items-center gap-1 text-[11px]">
                    {ing.matchedId ? (
                      <span className="inline-flex items-center gap-1 text-success" title={`Gekoppeld aan ${ing.matchedName}`}>
                        <Link2 size={12} /> {ing.matchedName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gold-deep">
                        <CircleAlert size={12} /> nieuw — prijs onbekend
                      </span>
                    )}
                  </span>
                  <button onClick={() => removeIngr(i)} aria-label={`verwijder ingrediënt ${i + 1}`} className="grid size-6 shrink-0 place-items-center rounded-[7px] text-muted transition hover:bg-danger-soft hover:text-danger">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addIngr} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gold bg-champagne-soft px-3 py-1.5 text-[12.5px] font-semibold text-gold-deep transition hover:bg-champagne">
              <Plus size={13} /> Ingrediënt toevoegen
            </button>
            {anyInvalidAmount && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2 text-[12.5px] text-danger">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> Vul bij elk gemarkeerd ingrediënt een hoeveelheid in (of verwijder het). Zonder hoeveelheid kan de kostprijs niet kloppen.
              </div>
            )}
          </div>

          {/* Bereidingswijze */}
          <div className="rounded-[18px] border border-line bg-card p-4">
            <div className="mb-2 font-serif text-base font-semibold">Bereidingswijze</div>
            <div className="flex flex-col gap-2">
              {review.steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2 grid size-5 shrink-0 place-items-center rounded-full bg-champagne-soft text-[11px] font-bold text-gold-deep">{i + 1}</span>
                  <textarea value={step} onChange={(e) => patchStep(i, e.target.value)} rows={2} aria-label={`stap ${i + 1}`} className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[13px] leading-snug text-charcoal" />
                  <button onClick={() => removeStep(i)} aria-label={`verwijder stap ${i + 1}`} className="mt-1 grid size-6 shrink-0 place-items-center rounded-[7px] text-muted transition hover:bg-danger-soft hover:text-danger">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addStep} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gold bg-champagne-soft px-3 py-1.5 text-[12.5px] font-semibold text-gold-deep transition hover:bg-champagne">
              <Plus size={13} /> Stap toevoegen
            </button>
          </div>

          {/* Opslaan */}
          <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-[14px] border border-line bg-card px-4 py-3 shadow-[0_10px_30px_rgba(21,39,28,.12)]">
            <button onClick={() => { setStage("idle"); setReview(null); }} className="text-[13px] font-semibold text-muted transition hover:text-charcoal">
              Opnieuw scannen
            </button>
            <div className="flex items-center gap-3">
              {saveError && <span className="text-[12px] text-danger">{saveError}</span>}
              <button
                onClick={save}
                disabled={!canSave || isPending}
                className="inline-flex items-center gap-2 rounded-xl border border-forest bg-forest px-4 py-2.5 text-[13px] font-semibold text-white transition disabled:opacity-60"
              >
                {isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Opslaan in Recipe Lab
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
