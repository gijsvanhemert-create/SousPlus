import { prisma } from "@/server/db";
import type { CostMode } from "@/lib/cost";
import {
  computeVersionCosts,
  MAX_COMPONENT_DEPTH,
  type CostVersionNode,
  type VersionCost,
} from "@/lib/component-cost";

// Server-laag rond de pure component-kostenmotor (lib/component-cost.ts):
//  - laadt de volledige versie-graaf van een locatie en levert kosten per versie,
//  - valideert component-koppelingen server-side (cyclus + diepte).

/** Alle versies (ingrediënten + component-refs) van een locatie als reken-nodes. */
export async function loadVersionNodes(locationId: string): Promise<CostVersionNode[]> {
  const versions = await prisma.recipeVersion.findMany({
    where: { recipe: { locationId } },
    select: {
      id: true,
      yieldQty: true,
      ingredients: { select: { catalogItemId: true, amount: true, mode: true, pricePerUnit: true } },
      components: { select: { childVersionId: true, amount: true } },
    },
  });
  return versions.map((v) => ({
    id: v.id,
    yieldQty: v.yieldQty.toString(),
    ingredients: v.ingredients.map((i) => ({
      catalogItemId: i.catalogItemId,
      amount: i.amount.toString(),
      mode: i.mode as CostMode,
      pricePerUnit: i.pricePerUnit === null ? null : i.pricePerUnit.toString(),
    })),
    components: v.components.map((c) => ({ childVersionId: c.childVersionId, amount: c.amount.toString() })),
  }));
}

/** Foodcost/portie + unitCost per versie voor de hele locatie. */
export async function getVersionCostMap(locationId: string): Promise<Map<string, VersionCost>> {
  return computeVersionCosts(await loadVersionNodes(locationId));
}

// --- Cyclus- & diepte-validatie (recept-niveau) ------------------------------

/** Bouw recept→kind-recept adjacency uit alle component-links van de locatie. */
async function loadRecipeAdjacency(locationId: string): Promise<Map<string, Set<string>>> {
  const links = await prisma.recipeComponent.findMany({
    where: { childRecipe: { locationId } },
    select: { childRecipeId: true, parentVersion: { select: { recipeId: true } } },
  });
  const adj = new Map<string, Set<string>>();
  for (const l of links) {
    const set = adj.get(l.parentVersion.recipeId) ?? new Set<string>();
    set.add(l.childRecipeId);
    adj.set(l.parentVersion.recipeId, set);
  }
  return adj;
}

function canReach(adj: Map<string, Set<string>>, from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === to) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const next of adj.get(node) ?? []) stack.push(next);
  }
  return false;
}

/** Langste keten (in edges) omláág vanaf node. Graaf is acyclisch bij aanroep. */
function downDepth(adj: Map<string, Set<string>>, node: string, memo = new Map<string, number>()): number {
  const cached = memo.get(node);
  if (cached !== undefined) return cached;
  let best = 0;
  for (const child of adj.get(node) ?? []) best = Math.max(best, 1 + downDepth(adj, child, memo));
  memo.set(node, best);
  return best;
}

/** Langste keten (in edges) omhóóg naar node (via omgekeerde adjacency). */
function upDepth(radj: Map<string, Set<string>>, node: string, memo = new Map<string, number>()): number {
  const cached = memo.get(node);
  if (cached !== undefined) return cached;
  let best = 0;
  for (const parent of radj.get(node) ?? []) best = Math.max(best, 1 + upDepth(radj, parent, memo));
  memo.set(node, best);
  return best;
}

function reverse(adj: Map<string, Set<string>>): Map<string, Set<string>> {
  const radj = new Map<string, Set<string>>();
  for (const [parent, children] of adj) {
    for (const child of children) {
      const set = radj.get(child) ?? new Set<string>();
      set.add(parent);
      radj.set(child, set);
    }
  }
  return radj;
}

/**
 * Werp een fout als parent → child een cyclus zou maken of de maximale nesting-
 * diepte overschrijdt. Draai dit vóór het aanmaken/herpinnen van een component.
 */
export async function assertComponentAllowed(locationId: string, parentRecipeId: string, childRecipeId: string) {
  if (parentRecipeId === childRecipeId) {
    throw new Error("Een recept kan zichzelf niet als component bevatten.");
  }
  const adj = await loadRecipeAdjacency(locationId);

  // Cyclus: als het kind (direct of indirect) al naar de parent verwijst.
  if (canReach(adj, childRecipeId, parentRecipeId)) {
    throw new Error("Dat zou een circulaire verwijzing maken: de component verwijst (indirect) al terug naar dit gerecht.");
  }

  // Diepte: langste keten die door de nieuwe edge zou lopen.
  const radj = reverse(adj);
  const chain = upDepth(radj, parentRecipeId) + 1 + downDepth(adj, childRecipeId);
  if (chain > MAX_COMPONENT_DEPTH) {
    throw new Error(`Te diep genest — maximaal ${MAX_COMPONENT_DEPTH} niveaus componenten.`);
  }
}
