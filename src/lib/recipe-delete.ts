import type { DeleteRecipeResult } from "@/server/menu-actions";

// Fallback voor een écht onverwachte fout (bv. netwerk); de server-side geweigerde
// gevallen dragen hun eigen, specifieke melding (zoals "wordt gebruikt als
// component in …") die we ongewijzigd doorgeven.
export const UNEXPECTED_DELETE_ERROR = "Verwijderen mislukt door een onverwachte fout. Probeer het opnieuw.";

/**
 * Orchestreert het verwijderen van een recept vanuit de Library: bij succes
 * onSuccess, bij een geweigerde verwijdering de ECHTE servermelding via onError.
 * Los van de component gehouden en getest, want hier zat het lek: de specifieke
 * "in gebruik als component"-melding werd door een bare catch vervangen door een
 * generieke "probeer opnieuw", terwijl opnieuw proberen niet helpt.
 */
export async function runDeleteRecipe(
  deps: {
    del: (input: { recipeId: string }) => Promise<DeleteRecipeResult>;
    onSuccess: () => void;
    onError: (message: string) => void;
  },
  recipeId: string,
): Promise<void> {
  try {
    const res = await deps.del({ recipeId });
    if (!res.ok) {
      deps.onError(res.error);
      return;
    }
    deps.onSuccess();
  } catch {
    deps.onError(UNEXPECTED_DELETE_ERROR);
  }
}
