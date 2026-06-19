import { requireSession } from "@/server/tenant";
import { getCheckpoints, getRecords, verifyLocationChain } from "@/server/haccp/records";
import { HACCP_RETENTION_YEARS } from "@/server/haccp/compliance";
import { HaccpBoard } from "@/components/haccp-board";

export default async function HaccpPage() {
  const session = await requireSession();
  const loc = session.user.locationId;

  const [checkpoints, records, verification] = await Promise.all([
    getCheckpoints(loc),
    getRecords(loc),
    verifyLocationChain(loc),
  ]);

  return (
    <HaccpBoard
      checkpoints={checkpoints}
      records={records}
      verification={verification}
      retentionYears={HACCP_RETENTION_YEARS}
    />
  );
}
