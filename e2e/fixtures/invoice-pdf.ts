// Bouwt een geldige eenpagina-PDF met leesbare (embedded Helvetica) tekst, zodat
// de e2e-upload ook door het ECHTE vision-model wordt uitgelezen — niet alleen
// door de mock. Byte-offsets in de xref worden exact berekend.

function escapePdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildInvoicePdf(text: string): Buffer {
  const lines = text.split("\n");
  let content = "BT\n/F1 11 Tf\n40 800 Td\n14 TL\n";
  for (const line of lines) content += `(${escapePdfText(line)}) Tj\nT*\n`;
  content += "ET";
  const contentLen = Buffer.byteLength(content, "latin1");

  const objects: Record<number, string> = {
    1: "<< /Type /Catalog /Pages 2 0 R >>",
    2: "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    3: "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    4: "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    5: `<< /Length ${contentLen} >>\nstream\n${content}\nendstream`,
  };

  const bytes = (s: string) => Buffer.byteLength(s, "latin1");
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  let pos = bytes(pdf);
  for (let i = 1; i <= 5; i++) {
    offsets[i] = pos;
    const obj = `${i} 0 obj\n${objects[i]}\nendobj\n`;
    pdf += obj;
    pos += bytes(obj);
  }

  const xrefPos = pos;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  pdf += xref + `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}
