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

export type LabVersion = {
  id: string;
  label: string;
  name: string;
  note: string | null;
  prepTimeMin: number;
  steps: string[];
  ingredients: LabIngredient[];
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
