import { requireSession } from "@/server/tenant";
import { getSupplierLines } from "@/server/supplier";
import { SupplierPortal } from "@/components/supplier-portal";

export default async function SupplierPage() {
  const session = await requireSession();
  const lines = await getSupplierLines(session.user.locationId);
  return <SupplierPortal lines={lines} />;
}
