"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenant } from "@/server/tenant";
import { appendRecord, verifyLocationChain, type AppendResult } from "./records";
import type { ChainVerification } from "./compliance";

// Server-actions voor de HACCP-dagstaat. Registreren is append-only; de
// ondertekenaar en norm-check komen server-side tot stand (niet te vervalsen
// vanuit de client).

const measureSchema = z.object({
  checkpointId: z.string().min(1),
  value: z
    .string()
    .trim()
    .transform((s) => s.replace(",", "."))
    .refine((s) => /^-?\d+(\.\d+)?$/.test(s), "Ongeldige meetwaarde"),
});

// Expliciet ok/error resultaat, zodat de UI een mislukte registratie ALTIJD
// zichtbaar kan maken (compliance-kritiek: een chef mag nooit denken dat een
// meting is vastgelegd terwijl dat niet zo is) en de server de echte oorzaak logt.
export type RecordMeasurementResult =
  | ({ ok: true } & AppendResult)
  | { ok: false; error: string };

export async function recordMeasurement(input: {
  checkpointId: string;
  value: string;
}): Promise<RecordMeasurementResult> {
  const tenant = await getTenant();
  const parsed = measureSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ongeldige meetwaarde." };
  }
  const { checkpointId, value } = parsed.data;

  try {
    const result = await appendRecord({
      locationId: tenant.locationId,
      checkpointId,
      value: Number(value),
      signedById: tenant.userId,
      signedByName: tenant.name ?? "Onbekend",
    });
    revalidatePath("/haccp");
    return { ok: true, ...result };
  } catch (err) {
    const code = (err as { code?: string }).code;
    // Gestructureerd loggen met context (checkpoint + locatie) zodat een mislukte
    // HACCP-registratie in de serverlogs terug te vinden is.
    console.error(
      JSON.stringify({ at: "haccp.recordMeasurement", code: code ?? null, locationId: tenant.locationId, checkpointId }),
      err,
    );
    // P2003 = foreign key violation: de locationId uit de sessie bestaat niet
    // (meer) — meestal een verlopen/verouderde sessie (bv. na een DB-reseed).
    if (code === "P2003") {
      return { ok: false, error: "Je sessie lijkt verlopen (locatie niet gevonden). Log opnieuw in en probeer het opnieuw." };
    }
    // appendRecord gooit bewust een gebruikersgerichte melding (bv. "Registratiepunt
    // niet gevonden in deze locatie.") — die tonen we eerlijk. Een onverwachte
    // infra-fout (mét Prisma-code) blijft generiek.
    if (!code && err instanceof Error && err.message) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Vastleggen is mislukt. Probeer het opnieuw." };
  }
}

export async function verifyChainAction(): Promise<ChainVerification> {
  const tenant = await getTenant();
  return verifyLocationChain(tenant.locationId);
}
