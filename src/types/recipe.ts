// Serialiseerbare DTO's voor de Recipe Lab — geld als string (volle Decimal-
// precisie, geen floats over de server→client-grens). Puur type-only bestand:
// geen runtime-imports, dus veilig te importeren in client components.
import type { CostMode } from "@/lib/cost";

export type LabIngredient = {
  id: string;
  catalogItemId: string | null;
  name: string;
  amount: string; // Decimal als string (gram/ml of aantal)
  unit: string;
  mode: CostMode;
  pricePerUnit: string; // Decimal als string (per kg/L of per eenheid)
};

// Een component/sub-recept dat een parent-versie gebruikt. Gepind op een vaste
// kind-versie (versionLabel); childActiveVersionId dient om in de UI te tonen dat
// er een nieuwere actieve versie beschikbaar is.
export type LabComponent = {
  id: string;
  childRecipeId: string;
  childVersionId: string;
  name: string; // gerechtnaam van de component
  versionLabel: string; // label van de gepinde kind-versie
  childActiveVersionId: string | null; // huidige actieve versie van de component
  amount: string; // Decimal als string (per couvert van de parent)
  unit: string;
  mode: CostMode;
};

export type LabVersion = {
  id: string;
  label: string;
  name: string;
  note: string | null;
  prepTimeMin: number;
  steps: string[];
  // Yield: hoeveel één portie van deze versie is (voor component-schaling).
  yieldQty: string; // Decimal als string
  yieldUnit: string;
  yieldMode: CostMode;
  ingredients: LabIngredient[];
  components: LabComponent[];
};

export type LabRecipe = {
  id: string;
  dish: string;
  category: string;
  menuPrice: string; // Decimal als string
  popularity: number;
  favorite: boolean;
  isOnMenu: boolean;
  activeVersionId: string | null;
  versions: LabVersion[];
};

export type CatalogResult = {
  id: string;
  name: string;
  category: string;
  supplier: string;
  unit: string;
  price: string; // Decimal als string
};

// Kandidaat-recept voor de component-picker (bestaande recepten i.p.v. catalogus).
export type CandidateRecipe = {
  id: string;
  dish: string;
  category: string;
  activeVersionId: string;
  versionLabel: string;
};
