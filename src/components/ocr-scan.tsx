"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Upload, FileText, ScanLine, Loader2, CheckCircle2, AlertTriangle, Plus, X } from "lucide-react";
import { eur } from "@/lib/format";
import { scanInvoiceFileAction, applyInvoiceAction, addCatalogItemFromLineAction } from "@/server/ocr-actions";
import { useWatchdogStore } from "@/lib/watchdog-store";
import { parsePrice, toApplyPayload, type EditableLine } from "@/lib/ocr-apply";

// Foto's worden client-side verkleind naar deze lange zijde vóór upload: kleiner
// request én de resolutie waarop het vision-model (Haiku) optimaal leest.
const MAX_EDGE = 1568;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

type Selected = { kind: "image" | "pdf"; mediaType: string; data: string; name: string; preview: string | null };
// Bewerkbare regel + de UI-status voor prijs-edit en het toevoeg-formulier.
type Row = EditableLine & {
  priceText: string;
  adding: boolean;
  saving: boolean;
  newName: string;
  newUnit: string;
  newCategory: string;
  added: null | "created" | "existing";
  addError: string | null;
};

function stripDataUrl(dataUrl: string): string {
  return dataUrl.split(",")[1] ?? "";
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(stripDataUrl(String(r.result)));
    r.onerror = () => reject(r.error ?? new Error("Kon bestand niet lezen"));
    r.readAsDataURL(file);
  });
}

// Verkleint een afbeelding via canvas en her-encodeert als JPEG (kwaliteit 0.8).
async function resizeImage(file: File): Promise<{ data: string; preview: string }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Kon afbeelding niet laden"));
      i.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas niet beschikbaar");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    return { data: stripDataUrl(dataUrl), preview: dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function OcrScan({ categories }: { categories: string[] }) {
  const defaultCategory = categories.includes("Overig") ? "Overig" : categories[0] ?? "Overig";

  const [selected, setSelected] = useState<Selected | null>(null);
  const [stage, setStage] = useState<"idle" | "scanning" | "done">("idle");
  const [rows, setRows] = useState<Row[]>([]);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const recognised = rows.length;
  const matched = rows.filter((r) => r.matchedId).length;
  const unmatched = rows.filter((r) => !r.matchedId).length;
  const applyPayload = toApplyPayload(rows);

  const patch = (i: number, next: Partial<Row>) => setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...next } : r)));

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setRows([]);
    setApplied(false);
    setStage("idle");
    if (!ALLOWED.includes(file.type)) {
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
    setApplied(false);
    setRows([]);
    setError(null);
    startTransition(async () => {
      try {
        const res = await scanInvoiceFileAction({ kind: selected.kind, mediaType: selected.mediaType, data: selected.data });
        setRows(
          res.lines.map((l) => ({
            ...l,
            include: l.matchedId != null,
            priceText: l.unitPrice.toFixed(2).replace(".", ","),
            adding: false,
            saving: false,
            newName: l.name,
            newUnit: l.unit,
            newCategory: defaultCategory,
            added: null,
            addError: null,
          })),
        );
        if (res.lines.length === 0) {
          setError("Geen regels herkend. Maak een scherpere foto (recht van boven, goed licht) of upload de PDF.");
        }
      } catch {
        setError("Scannen mislukt. Probeer het opnieuw of gebruik een andere foto/PDF.");
      } finally {
        setStage("done");
      }
    });
  }

  function setPrice(i: number, text: string) {
    setRows((prev) =>
      prev.map((r, idx) => {
        if (idx !== i) return r;
        const parsed = parsePrice(text);
        return { ...r, priceText: text, unitPrice: parsed ?? r.unitPrice };
      }),
    );
  }

  function toggleInclude(i: number) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, include: !r.include } : r)));
  }

  function submitAdd(i: number) {
    const row = rows[i];
    if (!row || row.saving) return;
    const name = row.newName.trim();
    const unit = row.newUnit.trim();
    const price = parsePrice(row.priceText);
    if (!name || !unit) {
      patch(i, { addError: "Naam en eenheid zijn verplicht." });
      return;
    }
    if (price === null) {
      patch(i, { addError: "Vul een geldige prijs in." });
      return;
    }
    patch(i, { saving: true, addError: null });
    startTransition(async () => {
      try {
        const res = await addCatalogItemFromLineAction({ name, unit, price, category: row.newCategory });
        patch(i, {
          saving: false,
          adding: false,
          matchedId: res.id,
          matchedName: res.name,
          include: false,
          added: res.created ? "created" : "existing",
        });
      } catch {
        patch(i, { saving: false, addError: "Toevoegen mislukt. Probeer het opnieuw." });
      }
    });
  }

  function apply() {
    if (applyPayload.length === 0) return;
    startTransition(async () => {
      await applyInvoiceAction({ lines: applyPayload });
      setApplied(true);
      void useWatchdogStore.getState().refresh();
    });
  }

  return (
    <div className="max-w-[860px]">
      <p className="mb-5 mt-0 max-w-[560px] text-[14.5px] leading-relaxed text-ink">
        Maak een foto van een leveranciersfactuur of upload een PDF — geen handmatige invoer meer. De OCR-laag (Tier 1)
        leest de regels uit en koppelt ze aan je voorraadprijzen. Controleer en corrigeer ze, en voeg nieuwe artikelen toe
        aan de catalogus, voordat je de prijzen bijwerkt.
      </p>

      <div className="grid gap-5 min-[720px]:grid-cols-2">
        {/* Invoer */}
        <div className="rounded-[18px] border border-line bg-card p-5">
          <div className="relative mb-3.5 overflow-hidden rounded-[14px] border-2 border-dashed border-line bg-canvas px-4.5 py-6 text-center">
            {stage === "scanning" && (
              <div className="absolute left-0 right-0 h-0.5 bg-gold shadow-[0_0_12px_var(--color-gold)] [animation:sp-scan_1.4s_linear_infinite]" />
            )}
            {selected?.preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.preview}
                alt="Voorbeeld van de gekozen factuur"
                className="mx-auto max-h-[180px] w-auto rounded-[10px] border border-line object-contain"
              />
            ) : (
              <>
                <div className="mx-auto mb-2.5 grid size-12 place-items-center rounded-xl bg-champagne-soft">
                  <FileText size={24} className="text-gold-deep" />
                </div>
                <div className="text-[13.5px] font-semibold">{selected ? selected.name : "Nog geen factuur gekozen"}</div>
                <div className="mt-0.5 text-xs text-muted">
                  {selected ? "PDF klaar om te scannen" : "Maak een foto of upload een JPG/PNG/PDF"}
                </div>
              </>
            )}
          </div>

          {/* Verborgen inputs: camera (mobiel/tablet) en bestandskiezer (foto of PDF). */}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? undefined)}
          />
          <input
            ref={uploadRef}
            data-testid="ocr-file-input"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0] ?? undefined)}
          />

          <div className="flex gap-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[11px] border border-line bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink"
            >
              <Camera size={16} /> Foto maken
            </button>
            <button
              onClick={() => uploadRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[11px] border border-line bg-card px-3.5 py-2.5 text-[13px] font-semibold text-ink"
            >
              <Upload size={16} /> Bestand kiezen
            </button>
          </div>

          <button
            onClick={scan}
            disabled={stage === "scanning" || !selected}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-[11px] bg-forest px-3.5 py-2.5 text-[13.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stage === "scanning" ? <Loader2 size={16} className="animate-spin" /> : <ScanLine size={16} />}
            {stage === "scanning" ? "Scant factuur…" : "Scan factuur"}
          </button>
        </div>

        {/* Resultaat */}
        <div className="min-h-[200px] rounded-[18px] border border-line bg-card p-5">
          {stage !== "done" && !error && (
            <div className="py-[50px] text-center text-[13.5px] text-muted">
              {stage === "scanning" ? "Regels worden uitgelezen…" : "Nog geen factuur gescand."}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-[12px] border border-line bg-canvas p-3.5 text-[13px] text-ink">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-gold-deep" />
              <span>{error}</span>
            </div>
          )}

          {stage === "done" && rows.length > 0 && (
            <div>
              <div className="mb-3.5 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-success" />
                <span className="text-[14px] font-semibold">
                  {recognised} regels herkend · {matched} gekoppeld
                </span>
              </div>

              {rows.map((it, i) => (
                <div key={i} className="border-b border-canvas py-2.5">
                  {it.added ? (
                    /* Zojuist toegevoegd of gekoppeld aan een bestaand artikel. */
                    <div className="flex items-center gap-2 text-[13px]">
                      <CheckCircle2 size={16} className="shrink-0 text-success" />
                      <span className="min-w-0">
                        <span className="font-medium">{it.name}</span>{" "}
                        <span className="text-success">
                          {it.added === "created" ? "· toegevoegd aan catalogus" : "· gekoppeld aan bestaand artikel"}
                        </span>
                      </span>
                    </div>
                  ) : it.matchedId ? (
                    /* Gekoppelde regel: prijs corrigeerbaar + in-/uitsluiten. */
                    <div className={`flex items-center gap-3 ${it.include ? "" : "opacity-50"}`}>
                      <input
                        type="checkbox"
                        checked={it.include}
                        onChange={() => toggleInclude(i)}
                        aria-label={`${it.name} bijwerken`}
                        className="size-4 shrink-0 accent-gold"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-medium">{it.name}</div>
                        <div className="text-[11.5px] text-muted">
                          {String(it.qty).replace(".", ",")} {it.unit} <span className="text-success">· {it.matchedName}</span>
                        </div>
                      </div>
                      <label className="flex items-center gap-1 text-[13px] tabular-nums">
                        <span className="text-muted">€</span>
                        <input
                          inputMode="decimal"
                          value={it.priceText}
                          onChange={(e) => setPrice(i, e.target.value)}
                          aria-label={`prijs ${it.name}`}
                          className={`w-[68px] rounded-md border bg-canvas px-2 py-1 text-right text-[13px] font-semibold ${
                            parsePrice(it.priceText) === null ? "border-danger" : "border-line"
                          }`}
                        />
                      </label>
                    </div>
                  ) : (
                    /* Niet-gekoppelde regel: als nieuw catalogusartikel toevoegen. */
                    <div>
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] font-medium">{it.name}</div>
                          <div className="text-[11.5px] text-muted">
                            {String(it.qty).replace(".", ",")} {it.unit} <span className="text-gold-deep">· niet gekoppeld</span>
                          </div>
                        </div>
                        {!it.adding && (
                          <>
                            <div className="text-right tabular-nums">
                              <div className="text-[13.5px] font-semibold">{eur(it.unitPrice)}</div>
                              <div className="text-[11.5px] text-muted">{eur(it.total)}</div>
                            </div>
                            <button
                              onClick={() => patch(i, { adding: true, addError: null })}
                              aria-label={`${it.name} toevoegen aan catalogus`}
                              className="flex shrink-0 items-center gap-1 rounded-[9px] border border-line bg-card px-2.5 py-1.5 text-[12px] font-semibold text-ink"
                            >
                              <Plus size={14} /> Toevoegen
                            </button>
                          </>
                        )}
                      </div>

                      {it.adding && (
                        <div className="mt-2.5 rounded-[12px] border border-line bg-canvas p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[12px] font-semibold text-ink">Nieuw catalogusartikel</span>
                            <button
                              onClick={() => patch(i, { adding: false })}
                              aria-label="Annuleren"
                              className="grid size-6 place-items-center rounded-md text-muted hover:text-ink"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          <div className="grid gap-2 min-[420px]:grid-cols-2">
                            <label className="text-[11.5px] text-muted">
                              Naam
                              <input
                                value={it.newName}
                                onChange={(e) => patch(i, { newName: e.target.value })}
                                aria-label="naam nieuw artikel"
                                className="mt-0.5 w-full rounded-md border border-line bg-card px-2 py-1 text-[13px] text-charcoal"
                              />
                            </label>
                            <label className="text-[11.5px] text-muted">
                              Categorie
                              <select
                                value={it.newCategory}
                                onChange={(e) => patch(i, { newCategory: e.target.value })}
                                aria-label="categorie nieuw artikel"
                                className="mt-0.5 w-full rounded-md border border-line bg-card px-2 py-1 text-[13px] text-charcoal"
                              >
                                {categories.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="text-[11.5px] text-muted">
                              Prijs (€)
                              <input
                                inputMode="decimal"
                                value={it.priceText}
                                onChange={(e) => setPrice(i, e.target.value)}
                                aria-label="prijs nieuw artikel"
                                className="mt-0.5 w-full rounded-md border border-line bg-card px-2 py-1 text-right text-[13px] font-semibold text-charcoal"
                              />
                            </label>
                            <label className="text-[11.5px] text-muted">
                              Eenheid
                              <input
                                value={it.newUnit}
                                onChange={(e) => patch(i, { newUnit: e.target.value })}
                                aria-label="eenheid nieuw artikel"
                                className="mt-0.5 w-full rounded-md border border-line bg-card px-2 py-1 text-[13px] text-charcoal"
                              />
                            </label>
                          </div>
                          {it.addError && <p className="mt-2 text-[11.5px] text-danger">{it.addError}</p>}
                          <button
                            onClick={() => submitAdd(i)}
                            disabled={it.saving}
                            className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-[10px] bg-forest px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
                          >
                            {it.saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Toevoegen aan catalogus
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {unmatched > 0 && (
                <p className="mt-2.5 text-[11.5px] text-muted">
                  {unmatched} regel{unmatched === 1 ? "" : "s"} niet gekoppeld — werk ze bij of voeg ze toe aan de catalogus.
                </p>
              )}

              <button
                onClick={apply}
                disabled={applied || applyPayload.length === 0}
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
                    <Upload size={16} /> Werk {applyPayload.length > 0 ? `${applyPayload.length} ` : ""}voorraadprijzen bij
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
