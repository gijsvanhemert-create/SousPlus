import { describe, it, expect } from "vitest";
import {
  evalStatus,
  computeRecordHash,
  verifyChain,
  retentionUntil,
  type ChainRecord,
  type ChainPayload,
} from "./compliance";

function payload(i: number, prevHash: string | null, over: Partial<ChainPayload> = {}): ChainPayload {
  return {
    locationId: "loc",
    checkpointId: `cp${i}`,
    zone: `Koeling ${i}`,
    target: "≤ 4 °C",
    value: i.toFixed(2),
    unit: "°C",
    status: "OK",
    recordedAt: new Date(2026, 0, 1, 12, i).toISOString(),
    signedById: "u1",
    signedByName: "Mark",
    prevHash,
    ...over,
  };
}
function mkRecord(i: number, prevHash: string | null, over: Partial<ChainPayload> = {}): ChainRecord {
  const p = payload(i, prevHash, over);
  return { id: `r${i}`, ...p, hash: computeRecordHash(p) };
}
function rehash(r: ChainRecord): ChainRecord {
  const { id, hash, ...p } = r;
  void hash;
  return { id, ...p, hash: computeRecordHash(p) };
}
function chainOf(n: number): ChainRecord[] {
  const recs: ChainRecord[] = [];
  let prev: string | null = null;
  for (let i = 0; i < n; i++) {
    const r = mkRecord(i, prev);
    recs.push(r);
    prev = r.hash;
  }
  return recs;
}

describe("evalStatus (norm-check)", () => {
  it("LTE: op of onder de grens is OK", () => {
    expect(evalStatus(4, 4, "LTE")).toBe("OK");
    expect(evalStatus(3.9, 4, "LTE")).toBe("OK");
    expect(evalStatus(4.1, 4, "LTE")).toBe("ATTENTION");
  });
  it("GTE: op of boven de grens is OK", () => {
    expect(evalStatus(63, 63, "GTE")).toBe("OK");
    expect(evalStatus(64, 63, "GTE")).toBe("OK");
    expect(evalStatus(62.9, 63, "GTE")).toBe("ATTENTION");
  });
  it("ongeldige waarde → ATTENTION", () => {
    expect(evalStatus(Number.NaN, 4, "LTE")).toBe("ATTENTION");
  });
});

describe("computeRecordHash", () => {
  it("is deterministisch en gevoelig voor elke wijziging", () => {
    const p = payload(1, null);
    expect(computeRecordHash(p)).toBe(computeRecordHash(p));
    expect(computeRecordHash({ ...p, value: "9.00" })).not.toBe(computeRecordHash(p));
    expect(computeRecordHash({ ...p, status: "ATTENTION" })).not.toBe(computeRecordHash(p));
    expect(computeRecordHash({ ...p, prevHash: "x" })).not.toBe(computeRecordHash(p));
  });
});

describe("verifyChain (tamper-evidentie)", () => {
  it("een onaangeroerde keten is geldig", () => {
    const res = verifyChain(chainOf(4));
    expect(res.valid).toBe(true);
    if (res.valid) expect(res.count).toBe(4);
  });

  it("een lege keten is geldig", () => {
    expect(verifyChain([]).valid).toBe(true);
  });

  it("detecteert een gewijzigd record (hash klopt niet meer)", () => {
    const c = chainOf(4);
    c[1] = { ...c[1], value: "99.00" }; // waarde vervalst, hash niet bijgewerkt
    const res = verifyChain(c);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.brokenAt).toBe("r1");
      expect(res.reason).toContain("hash");
    }
  });

  it("detecteert een vervalst hashveld", () => {
    const c = chainOf(4);
    c[2] = { ...c[2], hash: "deadbeef" };
    expect(verifyChain(c).valid).toBe(false);
  });

  it("detecteert een gebroken schakel (prevHash wijst verkeerd)", () => {
    const c = chainOf(4);
    c[2] = rehash({ ...c[2], prevHash: "wrong" }); // intern consistent, maar link kapot
    const res = verifyChain(c);
    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.brokenAt).toBe("r2");
      expect(res.reason).toContain("schakel");
    }
  });
});

describe("retentionUntil", () => {
  it("telt het bewaartermijn-aantal jaren op", () => {
    expect(retentionUntil(new Date(2026, 5, 18, 12), 2).getFullYear()).toBe(2028);
  });
});
