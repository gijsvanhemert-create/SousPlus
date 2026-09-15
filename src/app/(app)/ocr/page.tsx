import { requireSession } from "@/server/tenant";
import { listCatalogCategories } from "@/server/catalog";
import { OcrScan } from "@/components/ocr-scan";

export default async function OcrPage() {
  const session = await requireSession();
  const categories = await listCatalogCategories(session.user.locationId);
  return <OcrScan categories={categories} />;
}
