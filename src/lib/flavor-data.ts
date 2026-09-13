// Gecureerde affinity-dataset voor de Flavor Matcher. Eerlijke labeling: dit is
// een gecureerde set uit voedselchemie + chef-kennis; de live Foodpairing®-
// koppeling schakelt later in (na pilot-validatie). Pure data, client-safe.

export type FlavorPairing = { name: string; score: number; tags: string[] };

export const FLAVOR_DB: Record<string, FlavorPairing[]> = {
  salmon: [
    { name: "Witte Miso", score: 96, tags: ["Umami", "Fatty"] },
    { name: "Dille", score: 92, tags: ["Herbal"] },
    { name: "Citroen", score: 90, tags: ["Acidic"] },
    { name: "Crème Fraîche", score: 88, tags: ["Fatty"] },
    { name: "Sojasaus", score: 86, tags: ["Umami"] },
    { name: "Avocado", score: 84, tags: ["Fatty"] },
    { name: "Komkommer", score: 80, tags: ["Acidic"] },
    { name: "Bruine Boter", score: 79, tags: ["Fatty", "Umami"] },
    { name: "Yuzu", score: 77, tags: ["Acidic"] },
    { name: "Gember", score: 74, tags: ["Acidic"] },
  ],
  tomato: [
    { name: "Basilicum", score: 95, tags: ["Herbal"] },
    { name: "Parmezaan", score: 91, tags: ["Umami", "Fatty"] },
    { name: "Burrata", score: 89, tags: ["Fatty"] },
    { name: "Balsamico", score: 85, tags: ["Acidic"] },
    { name: "Ansjovis", score: 82, tags: ["Umami"] },
    { name: "Olijfolie", score: 78, tags: ["Fatty"] },
  ],
  beef: [
    { name: "Truffel", score: 94, tags: ["Umami", "Fatty"] },
    { name: "Rode Wijn", score: 90, tags: ["Acidic"] },
    { name: "Boter", score: 88, tags: ["Fatty"] },
    { name: "Tijm", score: 84, tags: ["Herbal"] },
    { name: "Mosterd", score: 80, tags: ["Acidic"] },
    { name: "Sjalot", score: 76, tags: ["Umami"] },
  ],
};

export const FLAVOR_FILTERS = ["Umami", "Fatty", "Acidic"];
