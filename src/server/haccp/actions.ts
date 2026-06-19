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

export async function recordMeasurement(input: {
  checkpointId: string;
  value: string;
}): Promise<AppendResult> {
  const tenant = await getTenant();
  const { checkpointId, value } = measureSchema.parse(input);

  const result = await appendRecord({
    locationId: tenant.locationId,
    checkpointId,
    value: Number(value),
    signedById: tenant.userId,
    signedByName: tenant.name ?? "Onbekend",
  });

  revalidatePath("/haccp");
  return result;
}

export async function verifyChainAction(): Promise<ChainVerification> {
  const tenant = await getTenant();
  return verifyLocationChain(tenant.locationId);
}
