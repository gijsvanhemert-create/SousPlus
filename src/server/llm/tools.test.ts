import { describe, it, expect } from "vitest";
import { TOOL_BY_NAME, TOOL_SCHEMAS, CHEF_TOOLS } from "./tools";
import { normalizeWeightUnit } from "@/lib/units";

function zodFor(name: string) {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) throw new Error(`tool ${name} ontbreekt`);
  return tool.zod;
}

describe("tool zod-validatie", () => {
  it("search_ingredients vereist een query", () => {
    expect(zodFor("search_ingredients").safeParse({ query: "biet" }).success).toBe(true);
    expect(zodFor("search_ingredients").safeParse({}).success).toBe(false);
  });

  it("save_recipe_version vereist een naam", () => {
    expect(zodFor("save_recipe_version").safeParse({ name: "Voorstel v1" }).success).toBe(true);
    expect(zodFor("save_recipe_version").safeParse({}).success).toBe(false);
  });

  it("update_recipe_version vereist een id", () => {
    expect(zodFor("update_recipe_version").safeParse({ id: "v1" }).success).toBe(true);
    expect(zodFor("update_recipe_version").safeParse({ name: "x" }).success).toBe(false);
  });

  it("navigate_app accepteert alleen bekende tabs", () => {
    expect(zodFor("navigate_app").safeParse({ tab: "lab" }).success).toBe(true);
    expect(zodFor("navigate_app").safeParse({ tab: "raket" }).success).toBe(false);
  });

  it("fill_haccp vereist minstens één meting", () => {
    expect(zodFor("fill_haccp").safeParse({ values: [{ zone: "Koeling", value: "3" }] }).success).toBe(true);
    expect(zodFor("fill_haccp").safeParse({ values: [] }).success).toBe(false);
  });

  it("switch_supplier vereist een ingrediënt", () => {
    expect(zodFor("switch_supplier").safeParse({ ingredient: "roomboter" }).success).toBe(true);
    expect(zodFor("switch_supplier").safeParse({}).success).toBe(false);
  });

  it("link_component vereist parent- én child-recipeId", () => {
    expect(zodFor("link_component").safeParse({ parentRecipeId: "p", childRecipeId: "c" }).success).toBe(true);
    expect(zodFor("link_component").safeParse({ parentRecipeId: "p" }).success).toBe(false);
    expect(zodFor("link_component").safeParse({}).success).toBe(false);
  });

  it("save_recipe_version accepteert optioneel asComponentOf", () => {
    expect(zodFor("save_recipe_version").safeParse({ name: "Saus v1", dish: "Saus", asComponentOf: { parentRecipeId: "rec_x" } }).success).toBe(true);
    // asComponentOf zonder parentRecipeId is ongeldig.
    expect(zodFor("save_recipe_version").safeParse({ name: "Saus v1", asComponentOf: {} }).success).toBe(false);
  });
});

describe("normalizeWeightUnit", () => {
  it("dwingt gewichtsingrediënten naar g af, ook als het model kg aanlevert", () => {
    // De bug: catalogus-eenheid "kg" werd als opslag-eenheid overgenomen.
    expect(normalizeWeightUnit("kg")).toBe("g");
    expect(normalizeWeightUnit("KG")).toBe("g");
    expect(normalizeWeightUnit("gram")).toBe("g");
    expect(normalizeWeightUnit(undefined)).toBe("g");
    expect(normalizeWeightUnit("")).toBe("g");
  });

  it("herkent volume-eenheden en normaliseert naar ml", () => {
    expect(normalizeWeightUnit("l")).toBe("ml");
    expect(normalizeWeightUnit("L")).toBe("ml");
    expect(normalizeWeightUnit("liter")).toBe("ml");
    expect(normalizeWeightUnit("ml")).toBe("ml");
    expect(normalizeWeightUnit("cl")).toBe("ml");
  });
});

describe("tool-metadata", () => {
  it("levert alle tools met API-schema's", () => {
    expect(CHEF_TOOLS).toHaveLength(8);
    expect(TOOL_SCHEMAS.map((t) => t.name).sort()).toEqual(
      ["fill_haccp", "link_component", "navigate_app", "prepare_haccp", "save_recipe_version", "search_ingredients", "switch_supplier", "update_recipe_version"].sort(),
    );
  });

  it("markeert overschrijvende acties als bevestiging-vereist", () => {
    expect(TOOL_BY_NAME.get("update_recipe_version")?.confirm).toBe(true);
    expect(TOOL_BY_NAME.get("switch_supplier")?.confirm).toBe(true);
    expect(TOOL_BY_NAME.get("link_component")?.confirm).toBe(true);
    expect(TOOL_BY_NAME.get("search_ingredients")?.confirm).toBe(false);
    expect(TOOL_BY_NAME.get("save_recipe_version")?.confirm).toBe(false);
  });

  it("save_recipe_version vraagt alleen bevestiging wanneer het als component koppelt", () => {
    const save = TOOL_BY_NAME.get("save_recipe_version")!;
    expect(save.confirmFor?.({ name: "Saus" })).toBe(false);
    expect(save.confirmFor?.({ name: "Saus", asComponentOf: { parentRecipeId: "rec_x" } })).toBe(true);
  });
});
