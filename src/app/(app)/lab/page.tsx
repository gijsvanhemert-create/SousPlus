import { requireSession } from "@/server/tenant";
import { getLabRecipes } from "@/server/recipes";
import { listCatalogCategories } from "@/server/catalog";
import { RecipeLab } from "@/components/recipe-lab";

export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string }>;
}) {
  const session = await requireSession();
  const [recipes, categories, { recipe }] = await Promise.all([
    getLabRecipes(session.user.locationId),
    listCatalogCategories(session.user.locationId),
    searchParams,
  ]);

  return <RecipeLab recipes={recipes} categories={categories} initialRecipeId={recipe} />;
}
