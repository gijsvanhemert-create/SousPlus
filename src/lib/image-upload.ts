// Gedeelde client-side helpers voor foto-/PDF-upload (factuur-OCR én recept-import).
// Foto's worden vóór upload verkleind naar MAX_EDGE: kleiner request én de
// resolutie waarop het vision-model optimaal leest.

export const MAX_EDGE = 1568;
export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function stripDataUrl(dataUrl: string): string {
  return dataUrl.split(",")[1] ?? "";
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(stripDataUrl(String(r.result)));
    r.onerror = () => reject(r.error ?? new Error("Kon bestand niet lezen"));
    r.readAsDataURL(file);
  });
}

// Verkleint een afbeelding via canvas en her-encodeert als JPEG (kwaliteit 0.8).
export async function resizeImage(file: File): Promise<{ data: string; preview: string }> {
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
