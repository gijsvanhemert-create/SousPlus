import { prisma } from "@/server/db";
import {
  computeRecordHash,
  evalStatus,
  retentionUntil,
  verifyChain,
  type ChainRecord,
  type ChainVerification,
  type HaccpStatus,
} from "./compliance";

// Append-only data-laag voor HACCP. Records worden nooit gewijzigd of verwijderd;
// een correctie is een nieuw record. Elke append haakt aan de hash van het laatste
// record van de locatie (hash-chain). Altijd gescopet op locationId.

export type CheckpointView = {
  id: string;
  zone: string;
  target: string;
  unit: string;
  limitValue: number;
  cmp: "LTE" | "GTE";
};

export type RecordView = {
  id: string;
  checkpointId: string;
  zone: string;
  target: string;
  value: string;
  unit: string;
  status: HaccpStatus;
  recordedAt: string;
  signedByName: string;
  hash: string;
  prevHash: string | null;
  retentionUntil: string;
};

// Canonieke string-vorm van de meetwaarde (vast 2 decimalen) zodat de hash
// reproduceerbaar is uit de opgeslagen Decimal.
function valueString(value: number): string {
  return value.toFixed(2);
}

function toChainRecord(r: {
  id: string;
  locationId: string;
  checkpointId: string;
  zone: string;
  target: string;
  value: { toFixed: (dp: number) => string };
  unit: string;
  status: HaccpStatus;
  recordedAt: Date;
  signedById: string;
  signedByName: string;
  prevHash: string | null;
  hash: string;
}): ChainRecord {
  return {
    id: r.id,
    locationId: r.locationId,
    checkpointId: r.checkpointId,
    zone: r.zone,
    target: r.target,
    value: r.value.toFixed(2),
    unit: r.unit,
    status: r.status,
    recordedAt: r.recordedAt.toISOString(),
    signedById: r.signedById,
    signedByName: r.signedByName,
    prevHash: r.prevHash,
    hash: r.hash,
  };
}

export async function getCheckpoints(locationId: string): Promise<CheckpointView[]> {
  const rows = await prisma.haccpCheckpoint.findMany({
    where: { locationId, active: true },
    orderBy: { zone: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    zone: c.zone,
    target: c.target,
    unit: c.unit,
    limitValue: Number(c.limitValue),
    cmp: c.cmp,
  }));
}

export async function getRecords(locationId: string, take = 100): Promise<RecordView[]> {
  const rows = await prisma.haccpRecord.findMany({
    where: { locationId },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    take,
  });
  return rows.map((r) => ({
    id: r.id,
    checkpointId: r.checkpointId,
    zone: r.zone,
    target: r.target,
    value: r.value.toFixed(2),
    unit: r.unit,
    status: r.status,
    recordedAt: r.recordedAt.toISOString(),
    signedByName: r.signedByName,
    hash: r.hash,
    prevHash: r.prevHash,
    retentionUntil: retentionUntil(r.recordedAt).toISOString(),
  }));
}

export type AppendResult = { status: HaccpStatus; record: RecordView };

/**
 * Voeg één meting toe aan de keten. Norm-check en hash worden server-side
 * berekend; de ondertekenaar komt uit de sessie. Lezen-van-laatste + schrijven
 * lopen in één transactie zodat de keten consistent blijft.
 */
export async function appendRecord(input: {
  locationId: string;
  checkpointId: string;
  value: number;
  signedById: string;
  signedByName: string;
}): Promise<AppendResult> {
  if (!Number.isFinite(input.value)) throw new Error("Ongeldige meetwaarde.");

  return prisma.$transaction(async (tx) => {
    const cp = await tx.haccpCheckpoint.findFirst({
      where: { id: input.checkpointId, locationId: input.locationId },
    });
    if (!cp) throw new Error("Registratiepunt niet gevonden in deze locatie.");

    const status = evalStatus(input.value, Number(cp.limitValue), cp.cmp);
    const last = await tx.haccpRecord.findFirst({
      where: { locationId: input.locationId },
      orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
      select: { hash: true },
    });
    const prevHash = last?.hash ?? null;
    const recordedAt = new Date();
    const value = valueString(input.value);

    const hash = computeRecordHash({
      locationId: input.locationId,
      checkpointId: cp.id,
      zone: cp.zone,
      target: cp.target,
      value,
      unit: cp.unit,
      status,
      recordedAt: recordedAt.toISOString(),
      signedById: input.signedById,
      signedByName: input.signedByName,
      prevHash,
    });

    const created = await tx.haccpRecord.create({
      data: {
        locationId: input.locationId,
        checkpointId: cp.id,
        zone: cp.zone,
        target: cp.target,
        value,
        unit: cp.unit,
        status,
        recordedAt,
        signedById: input.signedById,
        signedByName: input.signedByName,
        prevHash,
        hash,
      },
    });

    return {
      status,
      record: {
        id: created.id,
        checkpointId: created.checkpointId,
        zone: created.zone,
        target: created.target,
        value: created.value.toFixed(2),
        unit: created.unit,
        status: created.status,
        recordedAt: created.recordedAt.toISOString(),
        signedByName: created.signedByName,
        hash: created.hash,
        prevHash: created.prevHash,
        retentionUntil: retentionUntil(created.recordedAt).toISOString(),
      },
    };
  });
}

/** Verifieer de volledige hash-chain van een locatie (manipulatiedetectie). */
export async function verifyLocationChain(locationId: string): Promise<ChainVerification> {
  const rows = await prisma.haccpRecord.findMany({
    where: { locationId },
    orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
  });
  return verifyChain(rows.map(toChainRecord));
}
