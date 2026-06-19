import { requireSession } from "@/server/tenant";
import { getMenuOverview } from "@/server/menu";
import { RecipeLibrary } from "@/components/recipe-library";

export default async function LibraryPage() {
  const session = await requireSession();
  const items = await getMenuOverview(session.user.locationId);
  return <RecipeLibrary items={items} />;
}
