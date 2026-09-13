import { createHash } from "node:crypto";

// HACCP-compliancekern — pure, los geteste functies. Geen database, geen Prisma:
// hashing, ketenverificatie (tamper-evidentie), norm-check en retentie.
//
// Registraties zijn append-only en manipulatie-bestendig: elk record draagt de
// hash van het vorige record (hash-chain). Een wijziging in een oud record
// breekt de keten vanaf dat punt, wat de verificatie detecteert.

export type HaccpStatus = "OK" | "ATTENTION";
export type Cmp = "LTE" | "GTE";

/** Wettelijke bewaarplicht voor HACCP-registraties (NL: doorgaans 2 jaar). */
export const HACCP_RETENTION_YEARS = Number(process.env.HACCP_RETENTION_YEARS ?? 2);

/** Norm-check: bepaalt OK/ATTENTION uit meetwaarde, grenswaarde en richting. */
export function evalStatus(value: number, limit: number, cmp: Cmp): HaccpStatus {
  if (!Number.isFinite(value)) return "ATTENTION";
  const within = cmp === "LTE" ? value <= limit : value >= limit;
  return within ? "OK" : "ATTENTION";
}

/** Velden die de hash van een record bepalen (alles compliance-relevant). */
export type ChainPayload = {
  locationId: string;
  checkpointId: string;
  zone: string;
  target: string;
  value: string; // Decimal als string — stabiel
  unit: string;
  status: HaccpStatus;
  recordedAt: string; // ISO-tijdstempel
  signedById: string;
  signedByName: string;
  prevHash: string | null;
};

// Canonieke, deterministische serialisatie (vaste veldvolgorde) → sha256-hex.
function canonical(p: ChainPayload): string {
  return JSON.stringify([
    p.locationId,
    p.checkpointId,
    p.zone,
    p.target,
    p.value,
    p.unit,
    p.status,
    p.recordedAt,
    p.signedById,
    p.signedByName,
    p.prevHash ?? "",
  ]);
}

export function computeRecordHash(payload: ChainPayload): string {
  return createHash("sha256").update(canonical(payload)).digest("hex");
}

/** Een opgeslagen record zoals het in de keten staat (payload + eigen hash). */
export type ChainRecord = ChainPayload & { id?: string; hash: string };

export type ChainVerification =
  | { valid: true; count: number }
  | { valid: false; count: number; brokenAt: string | null; reason: string };

/**
 * Verifieer de volledige keten (op recordedAt → id geordend). Detecteert zowel
 * een gewijzigd record (hash klopt niet meer) als een gebroken schakel
 * (prevHash wijst niet naar de hash van het vorige record).
 */
export function verifyChain(records: ChainRecord[]): ChainVerification {
  let prevHash: string | null = null;
  for (const r of records) {
    if ((r.prevHash ?? null) !== prevHash) {
      return { valid: false, count: records.length, brokenAt: r.id ?? null, reason: "gebroken schakel (prevHash)" };
    }
    const expected = computeRecordHash({
      locationId: r.locationId,
      checkpointId: r.checkpointId,
      zone: r.zone,
      target: r.target,
      value: r.value,
      unit: r.unit,
      status: r.status,
      recordedAt: r.recordedAt,
      signedById: r.signedById,
      signedByName: r.signedByName,
      prevHash: r.prevHash,
    });
    if (expected !== r.hash) {
      return { valid: false, count: records.length, brokenAt: r.id ?? null, reason: "gewijzigd record (hash)" };
    }
    prevHash = r.hash;
  }
  return { valid: true, count: records.length };
}

/** Bewaartermijn-einddatum van een registratie. */
export function retentionUntil(recordedAt: Date | string, years = HACCP_RETENTION_YEARS): Date {
  const d = new Date(recordedAt);
  return new Date(d.getFullYear() + years, d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
}
