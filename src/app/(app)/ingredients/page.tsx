import { requireSession } from "@/server/tenant";
import { getCatalog } from "@/server/catalog";
import { IngredientCatalog } from "@/components/ingredient-catalog";

export default async function IngredientsPage() {
  const session = await requireSession();
  const { items, categories, counts } = await getCatalog(session.user.locationId);
  return <IngredientCatalog items={items} categories={categories} counts={counts} />;
}
