import { requireSession } from "@/server/tenant";
import { getLabRecipes } from "@/server/recipes";
import { RecipeLab } from "@/components/recipe-lab";

export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string }>;
}) {
  const session = await requireSession();
  const [recipes, { recipe }] = await Promise.all([getLabRecipes(session.user.locationId), searchParams]);

  return <RecipeLab recipes={recipes} initialRecipeId={recipe} />;
}
