import type { RecordMeasurementResult } from "@/server/haccp/actions";
import type { RecordView } from "@/server/haccp/records";

// Melding voor een écht onverwachte fout (bv. netwerk): benadruk expliciet dat de
// meting NIET is opgeslagen — bij een compliance-registratie is stille twijfel het
// gevaarlijkst.
export const UNEXPECTED_RECORD_ERROR =
  "Vastleggen mislukt door een onverwachte fout. De meting is niet opgeslagen — probeer het opnieuw.";

/**
 * Orchestreert één HACCP-registratie vanuit de UI: een geslaagde meting gaat naar
 * onSuccess, en ELKE fout (server-side geweigerd óf onverwacht gegooid) naar
 * onError — zodat de gebruiker altijd ziet wanneer er niets is vastgelegd. Los van
 * de component gehouden en getest, want hier zat eerder het lek: de fout werd stil
 * geslikt (bare catch, geen melding).
 */
export async function runRecordMeasurement(
  deps: {
    record: (input: { checkpointId: string; value: string }) => Promise<RecordMeasurementResult>;
    onSuccess: (record: RecordView) => void;
    onError: (message: string) => void;
  },
  input: { checkpointId: string; value: string },
): Promise<void> {
  try {
    const res = await deps.record(input);
    if (!res.ok) {
      deps.onError(res.error);
      return;
    }
    deps.onSuccess(res.record);
  } catch {
    deps.onError(UNEXPECTED_RECORD_ERROR);
  }
}
