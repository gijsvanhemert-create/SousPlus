import { describe, it, expect, vi } from "vitest";
import { runRecordMeasurement, UNEXPECTED_RECORD_ERROR } from "./haccp-record";
import type { RecordView } from "@/server/haccp/records";

// Deze test bewaakt de UI-laag, niet de server. De server-action gaf de juiste
// melding al terug; het lek zat in de component die de fout stil slikte. We
// bevestigen hier dat elke mislukking daadwerkelijk bij de gebruiker (onError)
// terechtkomt en een geslaagde meting NIET als fout wordt gemeld.

const RECORD: RecordView = {
  id: "r1",
  checkpointId: "cp1",
  zone: "Koeling 1",
  target: "<= 4 C",
  value: "3.00",
  unit: "C",
  status: "OK",
  recordedAt: "2026-09-17T10:00:00.000Z",
  signedByName: "Chef",
  hash: "abc",
  prevHash: null,
  retentionUntil: "2028-09-17T10:00:00.000Z",
};

describe("runRecordMeasurement", () => {
  it("toont de specifieke servermelding aan de gebruiker als de registratie wordt geweigerd", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();

    await runRecordMeasurement(
      {
        record: async () => ({ ok: false, error: "Registratiepunt niet gevonden in deze locatie." }),
        onSuccess,
        onError,
      },
      { checkpointId: "cp1", value: "3" },
    );

    expect(onError).toHaveBeenCalledWith("Registratiepunt niet gevonden in deze locatie.");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("meldt bij een onverwacht gegooide fout expliciet dat de meting NIET is opgeslagen", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();

    await runRecordMeasurement(
      {
        record: async () => {
          throw new Error("network down");
        },
        onSuccess,
        onError,
      },
      { checkpointId: "cp1", value: "3" },
    );

    expect(onError).toHaveBeenCalledWith(UNEXPECTED_RECORD_ERROR);
    expect(UNEXPECTED_RECORD_ERROR).toMatch(/niet.*opgeslagen/i);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("routeert een geslaagde meting naar onSuccess en meldt géén fout", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();

    await runRecordMeasurement(
      { record: async () => ({ ok: true, status: "OK", record: RECORD }), onSuccess, onError },
      { checkpointId: "cp1", value: "3" },
    );

    expect(onSuccess).toHaveBeenCalledWith(RECORD);
    expect(onError).not.toHaveBeenCalled();
  });
});
