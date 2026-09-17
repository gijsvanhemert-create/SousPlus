import { requireSession } from "@/server/tenant";
import { RecipeImport } from "@/components/recipe-import";

export default async function RecipeImportPage() {
  // Sessie/locatie afdwingen; de extractie- en opslag-acties scopen zelf op de tenant.
  await requireSession();
  return <RecipeImport />;
}
