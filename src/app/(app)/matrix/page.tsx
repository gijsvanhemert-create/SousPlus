import { requireSession } from "@/server/tenant";
import { getMenuOverview } from "@/server/menu";
import { MenuMatrix } from "@/components/menu-matrix";

export default async function MatrixPage() {
  const session = await requireSession();
  const items = await getMenuOverview(session.user.locationId);
  return <MenuMatrix items={items} />;
}
