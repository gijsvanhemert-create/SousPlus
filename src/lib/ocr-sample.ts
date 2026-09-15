// Interne voorbeeldfactuur — testfixture, geen gebruikersgerichte invoerweg meer.
// Gebruikt door de mock-OCR (deterministische regels zonder ANTHROPIC_API_KEY) en
// door de OCR-pariteitstest. De echte invoer loopt via foto-/PDF-upload.
export const SAMPLE_INVOICE_TEXT =
  "GROOTHANDEL SLIGRO B.V. — Factuur 2026-04412\nDatum 14-05-2026  Klant: Bistro+ Den Bosch\n" +
  "------------------------------------------------\nArtikel                 Aantal   Prijs    Totaal\n" +
  "Zalmfilet vers           4,2 kg   29,40    123,48\nRoomboter ongezouten     2,0 kg   11,20     22,40\n" +
  "Sushirijst koshihikari    8,0 kg    3,95     31,60\nSesamzaad geroosterd      0,5 kg   11,30      5,65\n" +
  "Mirin Hon                 2,0 L     9,80     19,60\n------------------------------------------------\nTotaal incl. BTW                           220,98";
