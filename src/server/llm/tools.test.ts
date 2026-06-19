import { describe, it, expect } from "vitest";
import { TOOL_BY_NAME, TOOL_SCHEMAS, CHEF_TOOLS } from "./tools";

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
});

describe("tool-metadata", () => {
  it("levert alle 7 prototype-tools met API-schema's", () => {
    expect(CHEF_TOOLS).toHaveLength(7);
    expect(TOOL_SCHEMAS.map((t) => t.name).sort()).toEqual(
      ["fill_haccp", "navigate_app", "prepare_haccp", "save_recipe_version", "search_ingredients", "switch_supplier", "update_recipe_version"].sort(),
    );
  });

  it("markeert overschrijvende acties als bevestiging-vereist", () => {
    expect(TOOL_BY_NAME.get("update_recipe_version")?.confirm).toBe(true);
    expect(TOOL_BY_NAME.get("switch_supplier")?.confirm).toBe(true);
    expect(TOOL_BY_NAME.get("search_ingredients")?.confirm).toBe(false);
    expect(TOOL_BY_NAME.get("save_recipe_version")?.confirm).toBe(false);
  });
});
