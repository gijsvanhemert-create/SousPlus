import { describe, it, expect, vi } from "vitest";
import { runDeleteRecipe, UNEXPECTED_DELETE_ERROR } from "./recipe-delete";

// Bewaakt de UI-laag: de server-action genereerde de "in gebruik als component"-
// melding al correct, maar de component ving die weg in een bare catch en toonde
// een generieke "probeer opnieuw". We bevestigen dat de ECHTE melding nu bij de
// gebruiker (onError) landt.

describe("runDeleteRecipe", () => {
  it("geeft de specifieke 'in gebruik als component'-melding onveranderd door aan de gebruiker", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const specifiek = "Kan niet verwijderen: wordt gebruikt als component in Risotto, Bisque.";

    await runDeleteRecipe(
      { del: async () => ({ ok: false, error: specifiek }), onSuccess, onError },
      "rec1",
    );

    expect(onError).toHaveBeenCalledWith(specifiek);
    // Geen generieke "probeer opnieuw" die de oorzaak verbergt.
    expect(onError).not.toHaveBeenCalledWith(UNEXPECTED_DELETE_ERROR);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("valt terug op een generieke melding bij een écht onverwachte fout", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();

    await runDeleteRecipe(
      {
        del: async () => {
          throw new Error("network down");
        },
        onSuccess,
        onError,
      },
      "rec1",
    );

    expect(onError).toHaveBeenCalledWith(UNEXPECTED_DELETE_ERROR);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("roept bij succes onSuccess aan en meldt géén fout", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();

    await runDeleteRecipe({ del: async () => ({ ok: true }), onSuccess, onError }, "rec1");

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });
});
