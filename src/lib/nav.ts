import {
  ChefHat,
  FlaskConical,
  Sparkles,
  RadioTower,
  Boxes,
  ScanLine,
  ScanText,
  ClipboardCheck,
  LayoutGrid,
  Grid2x2,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  /** Fase waarin de module functioneel wordt opgeleverd. */
  phase: number;
};

export const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Creatie",
    items: [
      { id: "chef", label: "AI Sous-Chef", icon: ChefHat, href: "/chef", phase: 4 },
      { id: "lab", label: "Recipe Lab", icon: FlaskConical, href: "/lab", phase: 3 },
      { id: "recipe-import", label: "Recept importeren", icon: ScanText, href: "/recipe-import", phase: 6 },
      { id: "flavor", label: "Flavor Matcher", icon: Sparkles, href: "/flavor", phase: 6 },
    ],
  },
  {
    section: "Operatie",
    items: [
      { id: "supplier", label: "Supplier Portal", icon: RadioTower, href: "/supplier", phase: 6 },
      { id: "ingredients", label: "Ingrediënten", icon: Boxes, href: "/ingredients", phase: 6 },
      { id: "ocr", label: "Factuur Scan", icon: ScanLine, href: "/ocr", phase: 6 },
      { id: "haccp", label: "HACCP-light", icon: ClipboardCheck, href: "/haccp", phase: 5 },
    ],
  },
  {
    section: "Inzicht",
    items: [
      { id: "library", label: "Recipe Library", icon: LayoutGrid, href: "/library", phase: 6 },
      { id: "matrix", label: "Menu Matrix", icon: Grid2x2, href: "/matrix", phase: 6 },
    ],
  },
];

export const FLAT_NAV: NavItem[] = NAV.flatMap((g) => g.items);

export const TITLES: Record<string, string> = {
  chef: "Chef de Cuisine",
  lab: "R&D Recipe Lab",
  "recipe-import": "Recept importeren",
  flavor: "Moleculaire Smaakanalyse",
  supplier: "Actuele inkoopprijzen",
  ocr: "Factuurverwerking (OCR)",
  haccp: "Voedselveiligheid",
  library: "Actieve Menukaart",
  matrix: "Menu-engineering",
  ingredients: "Ingrediëntencatalogus",
};
