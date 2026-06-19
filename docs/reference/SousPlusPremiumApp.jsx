import { useState, useMemo, useEffect, useRef } from "react";
import {
  ChefHat, FlaskConical, Sparkles, RadioTower, LayoutGrid, ScanLine, ClipboardCheck, Grid2x2,
  Bell, Settings, Heart, Search, Plus, Minus, Check, ArrowLeftRight, TrendingUp, TrendingDown,
  Eye, EyeOff, GitBranch, Crown, RefreshCw, X, Utensils, Send, Thermometer, AlertTriangle,
  CheckCircle2, FileText, Upload, Wand2, ArrowRight, Loader2, Clock, Lock, History,
  Boxes, PackageSearch, Store,
} from "lucide-react";

/* ===========================================================================
   SousPlus+ Premium — Geconsolideerde, responsieve MVP (B2B Premium)
   • Diep-groen / champagne-gold luxe minimalisme, boutique serif
   • AI Sous-Chef "Chef Auguste" — Claude-powered via officiële tool-use
   • Menu Matrix (Boston Grid) · Library koppelt aan Lab
   • HACCP-light met persistente opslag (window.storage) + audit trail
   • Eén responsieve layout: sidebar op breed, scrollbare topnav op smal
=========================================================================== */

const C = {
  forest: "#15271C", forestDeep: "#0E1A12", forest2: "#1E3527", forestLine: "#2E4A38",
  canvas: "#F4F2EC", card: "#FFFFFF", champagne: "#F0E6D2", champagneSoft: "#F7F1E6",
  gold: "#A8884E", goldDeep: "#8C6E3C", charcoal: "#1E2A22", ink: "#3A4640",
  muted: "#8A857C", line: "#E8E3D8", green: "#3F7A5B", greenSoft: "#EAF1EC",
  red: "#B4412E", redSoft: "#F6EAE6", amber: "#B6892F", amberSoft: "#FAF1DD",
  blue: "#3E6E8C", blueSoft: "#E9F0F4",
};
const serif = "'Fraunces', 'Georgia', serif";
const sans = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const eur = (n) => "€" + Number(n).toFixed(2).replace(".", ",");
const pct = (n) => Number(n).toFixed(1).replace(".", ",") + "%";
const nowTime = () => new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });
const dateStr = () => new Date().toLocaleDateString("nl-NL");
const STORAGE_OK = typeof window !== "undefined" && window.storage;

/* ------------------------------ Seed data -------------------------------- */
const BASE_PRICES = { salmon: 28.5, miso: 12.0, butter: 9.8, mirin: 9.5, rice: 3.8, sesame: 11.0 };

const SEED_VERSIONS = [
  { id: "v1.0", label: "v1.0", name: "Original", date: "12 jan", prepTime: 28, menuPrice: 21.5, dish: "Miso-Glazed Salmon",
    note: "Klassieke teriyaki-glace met bruine suiker en sojasaus. Rijk en zoet — maar de marge staat onder druk.",
    ingredients: [
      { id: "salmon", name: "Zalmfilet", g: 180, unit: "g", p: 28.5 }, { id: "soy", name: "Sojasaus", g: 20, unit: "ml", p: 6.5 },
      { id: "sugar", name: "Bruine suiker", g: 18, unit: "g", p: 2.2 }, { id: "mirin", name: "Mirin", g: 15, unit: "ml", p: 9.5 },
      { id: "butter", name: "Roomboter", g: 50, unit: "g", p: 9.8 }, { id: "onion", name: "Lente-ui", g: 10, unit: "g", p: 6 },
      { id: "sesame", name: "Sesamzaad", g: 3, unit: "g", p: 11 }, { id: "rice", name: "Sushirijst", g: 90, unit: "g", p: 3.8 },
    ],
    prep: ["Kook de teriyaki-glace in van sojasaus, mirin en bruine suiker.", "Marineer de zalm 20 minuten, velkant boven.", "Stoom de sushirijst en houd warm onder een vochtige doek.", "Bak de zalm op de velkant krokant, ± 4 minuten.", "Lak de zalm onder de salamander tot glanzend.", "Werk af met roomboter, lente-ui en sesam."] },
  { id: "v1.1", label: "v1.1", name: "Minder Zout", date: "26 feb", prepTime: 30, menuPrice: 22.0, dish: "Miso-Glazed Salmon",
    note: "Natriumarme iteratie: sojasaus deels vervangen door tamari, minder suiker. Schonere smaak.",
    ingredients: [
      { id: "salmon", name: "Zalmfilet", g: 180, unit: "g", p: 28.5 }, { id: "soy", name: "Tamari (natriumarm)", g: 14, unit: "ml", p: 8.2 },
      { id: "sugar", name: "Bruine suiker", g: 12, unit: "g", p: 2.2 }, { id: "mirin", name: "Mirin", g: 15, unit: "ml", p: 9.5 },
      { id: "butter", name: "Roomboter", g: 55, unit: "g", p: 9.8 }, { id: "onion", name: "Prei (gegrild)", g: 12, unit: "g", p: 6 },
      { id: "sesame", name: "Sesamzaad", g: 3, unit: "g", p: 11 }, { id: "rice", name: "Sushirijst", g: 90, unit: "g", p: 3.8 },
    ],
    prep: ["Meng tamari, mirin en een snuf suiker tot een lichte glace.", "Marineer de zalm 30 minuten, velkant boven.", "Stoom de sushirijst en houd warm.", "Bak de zalm krokant op de velkant, ± 4 minuten.", "Glaceer kort en houd de garing rosé.", "Monteer met roomboter, plateer op gegrilde prei en sesam."] },
  { id: "v1.2", label: "v1.2", name: "Witte Miso", date: "14 mei", prepTime: 32, menuPrice: 22.8, active: true, dish: "Miso-Glazed Salmon",
    note: "Actieve versie. Witte miso, sake en mirin geven diepe umami en een gelakte glans, afgewerkt met beurre blanc.",
    ingredients: [
      { id: "salmon", name: "Zalmfilet", g: 180, unit: "g", p: 28.5 }, { id: "miso", name: "Witte miso", g: 25, unit: "g", p: 12 },
      { id: "mirin", name: "Mirin", g: 15, unit: "ml", p: 9.5 }, { id: "sake", name: "Sake", g: 10, unit: "ml", p: 14 },
      { id: "butter", name: "Roomboter (beurre blanc)", g: 60, unit: "g", p: 9.8 }, { id: "sugar", name: "Bruine suiker", g: 8, unit: "g", p: 2.2 },
      { id: "onion", name: "Prei (gegrild)", g: 12, unit: "g", p: 6 }, { id: "sesame", name: "Sesamzaad", g: 3, unit: "g", p: 11 }, { id: "rice", name: "Sushirijst", g: 90, unit: "g", p: 3.8 },
    ],
    prep: ["Klop witte miso, mirin, sake en bruine suiker tot een gladde glace.", "Marineer de zalm 30 minuten, velkant boven.", "Stoom de sushirijst en houd warm onder een vochtige doek.", "Bak de zalm op de velkant krokant, ± 4 minuten.", "Glaceer en lak af onder de salamander tot gelakt.", "Monteer een beurre blanc, plateer over gegrilde prei, werk af met sesam."] },
];

const FLAVOR_DB = {
  salmon: [
    { name: "Witte Miso", score: 96, tags: ["Umami", "Fatty"] }, { name: "Dille", score: 92, tags: ["Herbal"] },
    { name: "Citroen", score: 90, tags: ["Acidic"] }, { name: "Crème Fraîche", score: 88, tags: ["Fatty"] },
    { name: "Sojasaus", score: 86, tags: ["Umami"] }, { name: "Avocado", score: 84, tags: ["Fatty"] },
    { name: "Komkommer", score: 80, tags: ["Acidic"] }, { name: "Bruine Boter", score: 79, tags: ["Fatty", "Umami"] },
    { name: "Yuzu", score: 77, tags: ["Acidic"] }, { name: "Gember", score: 74, tags: ["Acidic"] },
  ],
  tomato: [
    { name: "Basilicum", score: 95, tags: ["Herbal"] }, { name: "Parmezaan", score: 91, tags: ["Umami", "Fatty"] },
    { name: "Burrata", score: 89, tags: ["Fatty"] }, { name: "Balsamico", score: 85, tags: ["Acidic"] },
    { name: "Ansjovis", score: 82, tags: ["Umami"] }, { name: "Olijfolie", score: 78, tags: ["Fatty"] },
  ],
  beef: [
    { name: "Truffel", score: 94, tags: ["Umami", "Fatty"] }, { name: "Rode Wijn", score: 90, tags: ["Acidic"] },
    { name: "Boter", score: 88, tags: ["Fatty"] }, { name: "Tijm", score: 84, tags: ["Herbal"] },
    { name: "Mosterd", score: 80, tags: ["Acidic"] }, { name: "Sjalot", score: 76, tags: ["Umami"] },
  ],
};
const FILTER_TAGS = ["Umami", "Fatty", "Acidic"];

const LIBRARY = [
  { id: "salmon", name: "Miso-Glazed Salmon", cat: "Seafood", price: 22.8, margin: 70, fav: true, palette: ["#E9A06B", "#F2C9A0"], pop: 240 },
  { id: "tagliatelle", name: "Truffel Tagliatelle", cat: "Pasta", price: 19.5, margin: 68, fav: false, palette: ["#D8C27A", "#ECDFB0"], pop: 180 },
  { id: "cacio", name: "Cacio e Pepe", cat: "Pasta", price: 16.5, margin: 73, fav: false, palette: ["#E6D9B8", "#F2EAD2"], pop: 300 },
  { id: "beet", name: "Heritage Beet Tartare", cat: "Vegetable", price: 14.0, margin: 78, fav: true, palette: ["#9E4B5C", "#C97E8C"], pop: 90 },
  { id: "scallop", name: "Seared Scallops", cat: "Seafood", price: 26.0, margin: 66, fav: false, palette: ["#E8D5B5", "#F4E9D2"], pop: 70 },
  { id: "fondant", name: "Dark Chocolate Fondant", cat: "Desserts", price: 11.0, margin: 82, fav: false, palette: ["#5B3A2E", "#8A5C45"], pop: 210 },
];
const LIB_CATS = ["All", "Seafood", "Pasta", "Vegetable", "Desserts"];

/* Representatieve foodservice-catalogus (Hanos/Sligro-assortiment, indicatieve prijzen).
   In productie gevoed door de live leveranciersfeed. */
const INGREDIENTS = [
  { id: "zalmfilet-vers-noorwegen-0", name: "Zalmfilet vers (Noorwegen)", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 28.5 },
  { id: "zalmzijde-gerookt-1", name: "Zalmzijde gerookt", cat: "Vis & Zeevruchten", supplier: "Hanos", unit: "kg", price: 34.0 },
  { id: "kabeljauwfilet-msc-2", name: "Kabeljauwfilet MSC", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 24.9 },
  { id: "schol-filet-3", name: "Schol filet", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 19.5 },
  { id: "tongfilet-4", name: "Tongfilet", cat: "Vis & Zeevruchten", supplier: "Sligro", unit: "kg", price: 42.0 },
  { id: "tarbot-heel-5", name: "Tarbot heel", cat: "Vis & Zeevruchten", supplier: "Sligro", unit: "kg", price: 32.0 },
  { id: "zeebaars-wild-6", name: "Zeebaars (wild)", cat: "Vis & Zeevruchten", supplier: "Hanos", unit: "kg", price: 29.0 },
  { id: "doradefilet-7", name: "Doradefilet", cat: "Vis & Zeevruchten", supplier: "Hanos", unit: "kg", price: 21.5 },
  { id: "tonijn-loin-sashimi-8", name: "Tonijn loin (sashimi)", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 38.5 },
  { id: "roodbaarsfilet-9", name: "Roodbaarsfilet", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 18.9 },
  { id: "heilbot-10", name: "Heilbot", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 31.0 },
  { id: "gamba-s-16-20-ontdooid-11", name: "Gamba's 16/20 ontdooid", cat: "Vis & Zeevruchten", supplier: "Hanos", unit: "kg", price: 22.0 },
  { id: "garnalen-hollandse-gepeld-12", name: "Garnalen Hollandse gepeld", cat: "Vis & Zeevruchten", supplier: "Sligro", unit: "kg", price: 36.0 },
  { id: "coquilles-sint-jakobsschelpen-13", name: "Coquilles / Sint-jakobsschelpen", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 44.0 },
  { id: "mosselen-jumbo-14", name: "Mosselen jumbo", cat: "Vis & Zeevruchten", supplier: "Sligro", unit: "bak", price: 9.8 },
  { id: "oesters-creuses-doos-50-15", name: "Oesters Creuses (doos 50)", cat: "Vis & Zeevruchten", supplier: "Sligro", unit: "doos", price: 48.0 },
  { id: "inktvisringen-16", name: "Inktvisringen", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 14.5 },
  { id: "octopus-tentakel-17", name: "Octopus tentakel", cat: "Vis & Zeevruchten", supplier: "Hanos", unit: "kg", price: 26.0 },
  { id: "krab-kluifjes-18", name: "Krab kluifjes", cat: "Vis & Zeevruchten", supplier: "Sligro", unit: "kg", price: 19.0 },
  { id: "forel-gerookt-filet-19", name: "Forel gerookt filet", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 23.0 },
  { id: "haring-maatjes-20", name: "Haring maatjes", cat: "Vis & Zeevruchten", supplier: "Sligro", unit: "kg", price: 12.5 },
  { id: "paling-gerookt-21", name: "Paling gerookt", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 39.0 },
  { id: "surimi-sticks-22", name: "Surimi sticks", cat: "Vis & Zeevruchten", supplier: "Beide", unit: "kg", price: 8.9 },
  { id: "vislever-lotte-23", name: "Vislever (lotte)", cat: "Vis & Zeevruchten", supplier: "Hanos", unit: "kg", price: 16.0 },
  { id: "garnalenkroketten-40-st-24", name: "Garnalenkroketten (40 st)", cat: "Vis & Zeevruchten", supplier: "Sligro", unit: "doos", price: 28.0 },
  { id: "runderhaas-tenderloin-25", name: "Runderhaas (tenderloin)", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 39.5 },
  { id: "entrecote-iers-26", name: "Entrecote Iers", cat: "Vlees", supplier: "Sligro", unit: "kg", price: 27.0 },
  { id: "ribeye-27", name: "Ribeye", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 26.5 },
  { id: "bavette-28", name: "Bavette", cat: "Vlees", supplier: "Beide", unit: "kg", price: 19.5 },
  { id: "picanha-29", name: "Picanha", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 21.0 },
  { id: "runderriblappen-30", name: "Runderriblappen", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 12.5 },
  { id: "sucadelappen-31", name: "Sucadelappen", cat: "Vlees", supplier: "Sligro", unit: "kg", price: 13.5 },
  { id: "ossenstaart-32", name: "Ossenstaart", cat: "Vlees", supplier: "Sligro", unit: "kg", price: 9.8 },
  { id: "runderbouillonbotten-33", name: "Runderbouillonbotten", cat: "Vlees", supplier: "Beide", unit: "kg", price: 3.2 },
  { id: "kalfsschnitzel-34", name: "Kalfsschnitzel", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 28.0 },
  { id: "kalfszwezerik-35", name: "Kalfszwezerik", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 34.0 },
  { id: "kalfsfond-basis-36", name: "Kalfsfond basis", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 8.5 },
  { id: "varkenshaas-37", name: "Varkenshaas", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 12.9 },
  { id: "procureur-coppa-38", name: "Procureur / coppa", cat: "Vlees", supplier: "Sligro", unit: "kg", price: 9.5 },
  { id: "buikspek-39", name: "Buikspek", cat: "Vlees", supplier: "Beide", unit: "kg", price: 8.9 },
  { id: "speklap-40", name: "Speklap", cat: "Vlees", supplier: "Beide", unit: "kg", price: 6.5 },
  { id: "iberico-secreto-41", name: "Iberico secreto", cat: "Vlees", supplier: "Beide", unit: "kg", price: 18.5 },
  { id: "lamsrack-frenched-42", name: "Lamsrack Frenched", cat: "Vlees", supplier: "Beide", unit: "kg", price: 29.0 },
  { id: "lamsbout-zonder-been-43", name: "Lamsbout zonder been", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 22.0 },
  { id: "lamsschouder-44", name: "Lamsschouder", cat: "Vlees", supplier: "Beide", unit: "kg", price: 15.5 },
  { id: "hertenbiefstuk-45", name: "Hertenbiefstuk", cat: "Vlees", supplier: "Beide", unit: "kg", price: 31.0 },
  { id: "wild-zwijn-ragout-46", name: "Wild zwijn ragout", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 17.0 },
  { id: "gehakt-half-om-half-47", name: "Gehakt half-om-half", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 7.9 },
  { id: "rundergehakt-mager-48", name: "Rundergehakt mager", cat: "Vlees", supplier: "Hanos", unit: "kg", price: 9.2 },
  { id: "merg-pijpjes-49", name: "Merg pijpjes", cat: "Vlees", supplier: "Sligro", unit: "kg", price: 4.5 },
  { id: "kippenfilet-nl-50", name: "Kippenfilet (NL)", cat: "Gevogelte", supplier: "Hanos", unit: "kg", price: 8.9 },
  { id: "kippendijfilet-51", name: "Kippendijfilet", cat: "Gevogelte", supplier: "Beide", unit: "kg", price: 7.5 },
  { id: "kippenpoten-52", name: "Kippenpoten", cat: "Gevogelte", supplier: "Hanos", unit: "kg", price: 4.2 },
  { id: "hele-kip-1-4kg-53", name: "Hele kip 1.4kg", cat: "Gevogelte", supplier: "Sligro", unit: "stuk", price: 6.8 },
  { id: "kippenvleugels-54", name: "Kippenvleugels", cat: "Gevogelte", supplier: "Beide", unit: "kg", price: 4.9 },
  { id: "kippenkarkas-fond-55", name: "Kippenkarkas (fond)", cat: "Gevogelte", supplier: "Beide", unit: "kg", price: 2.1 },
  { id: "maiskip-supreme-56", name: "Maïskip supreme", cat: "Gevogelte", supplier: "Beide", unit: "kg", price: 14.5 },
  { id: "eendenborst-57", name: "Eendenborst", cat: "Gevogelte", supplier: "Beide", unit: "kg", price: 19.0 },
  { id: "eendenbout-confit-58", name: "Eendenbout confit", cat: "Gevogelte", supplier: "Hanos", unit: "kg", price: 12.5 },
  { id: "kalkoenfilet-59", name: "Kalkoenfilet", cat: "Gevogelte", supplier: "Beide", unit: "kg", price: 11.0 },
  { id: "parelhoen-supreme-60", name: "Parelhoen supreme", cat: "Gevogelte", supplier: "Beide", unit: "kg", price: 16.5 },
  { id: "kwartel-4-st-61", name: "Kwartel (4 st)", cat: "Gevogelte", supplier: "Hanos", unit: "doos", price: 13.0 },
  { id: "ganzenlever-foie-gras-62", name: "Ganzenlever / foie gras", cat: "Gevogelte", supplier: "Sligro", unit: "kg", price: 78.0 },
  { id: "kippenlevertjes-63", name: "Kippenlevertjes", cat: "Gevogelte", supplier: "Hanos", unit: "kg", price: 5.5 },
  { id: "prosciutto-di-parma-18mnd-64", name: "Prosciutto di Parma 18mnd", cat: "Charcuterie & Vleeswaren", supplier: "Beide", unit: "kg", price: 32.0 },
  { id: "serrano-ham-65", name: "Serrano ham", cat: "Charcuterie & Vleeswaren", supplier: "Sligro", unit: "kg", price: 24.0 },
  { id: "coppa-di-parma-66", name: "Coppa di Parma", cat: "Charcuterie & Vleeswaren", supplier: "Beide", unit: "kg", price: 36.0 },
  { id: "chorizo-picante-67", name: "Chorizo picante", cat: "Charcuterie & Vleeswaren", supplier: "Sligro", unit: "kg", price: 14.5 },
  { id: "salami-milano-68", name: "Salami Milano", cat: "Charcuterie & Vleeswaren", supplier: "Hanos", unit: "kg", price: 16.0 },
  { id: "pancetta-69", name: "Pancetta", cat: "Charcuterie & Vleeswaren", supplier: "Beide", unit: "kg", price: 18.0 },
  { id: "ontbijtspek-plakken-70", name: "Ontbijtspek plakken", cat: "Charcuterie & Vleeswaren", supplier: "Beide", unit: "kg", price: 9.5 },
  { id: "gerookte-eendenfilet-71", name: "Gerookte eendenfilet", cat: "Charcuterie & Vleeswaren", supplier: "Sligro", unit: "kg", price: 28.0 },
  { id: "rilettes-van-eend-72", name: "Rilettes van eend", cat: "Charcuterie & Vleeswaren", supplier: "Beide", unit: "kg", price: 19.0 },
  { id: "pate-en-croute-73", name: "Paté en croûte", cat: "Charcuterie & Vleeswaren", supplier: "Hanos", unit: "kg", price: 17.5 },
  { id: "bresaola-74", name: "Bresaola", cat: "Charcuterie & Vleeswaren", supplier: "Sligro", unit: "kg", price: 39.0 },
  { id: "mortadella-met-pistache-75", name: "Mortadella met pistache", cat: "Charcuterie & Vleeswaren", supplier: "Beide", unit: "kg", price: 13.0 },
  { id: "tomaten-trostomaat-76", name: "Tomaten trostomaat", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 3.2 },
  { id: "cherrytomaten-77", name: "Cherrytomaten", cat: "Groente (vers)", supplier: "Hanos", unit: "bak", price: 2.4 },
  { id: "roma-tomaten-78", name: "Roma tomaten", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 2.9 },
  { id: "komkommer-79", name: "Komkommer", cat: "Groente (vers)", supplier: "Sligro", unit: "stuk", price: 0.85 },
  { id: "paprika-mix-rood-geel-groen-80", name: "Paprika mix (rood/geel/groen)", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 3.5 },
  { id: "courgette-81", name: "Courgette", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 2.1 },
  { id: "aubergine-82", name: "Aubergine", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 2.8 },
  { id: "ui-geel-83", name: "Ui geel", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 0.95 },
  { id: "rode-ui-84", name: "Rode ui", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 1.4 },
  { id: "sjalot-85", name: "Sjalot", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 3.2 },
  { id: "knoflook-bollen-86", name: "Knoflook bollen", cat: "Groente (vers)", supplier: "Beide", unit: "kg", price: 6.5 },
  { id: "prei-87", name: "Prei", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 1.9 },
  { id: "lente-ui-bos-88", name: "Lente-ui (bos)", cat: "Groente (vers)", supplier: "Hanos", unit: "bos", price: 0.95 },
  { id: "wortel-89", name: "Wortel", cat: "Groente (vers)", supplier: "Beide", unit: "kg", price: 1.1 },
  { id: "bospeen-90", name: "Bospeen", cat: "Groente (vers)", supplier: "Sligro", unit: "bos", price: 1.6 },
  { id: "knolselderij-91", name: "Knolselderij", cat: "Groente (vers)", supplier: "Sligro", unit: "stuk", price: 1.8 },
  { id: "bleekselderij-92", name: "Bleekselderij", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 2.4 },
  { id: "venkel-93", name: "Venkel", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 3.1 },
  { id: "broccoli-94", name: "Broccoli", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 2.6 },
  { id: "bloemkool-95", name: "Bloemkool", cat: "Groente (vers)", supplier: "Beide", unit: "stuk", price: 1.9 },
  { id: "spruitjes-96", name: "Spruitjes", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 2.8 },
  { id: "sperziebonen-haricots-verts-97", name: "Sperziebonen (haricots verts)", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 4.2 },
  { id: "doperwten-vers-98", name: "Doperwten vers", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 5.5 },
  { id: "spinazie-blad-99", name: "Spinazie blad", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 4.8 },
  { id: "rucola-100", name: "Rucola", cat: "Groente (vers)", supplier: "Sligro", unit: "bak", price: 3.1 },
  { id: "little-gem-sla-101", name: "Little gem sla", cat: "Groente (vers)", supplier: "Sligro", unit: "stuk", price: 0.9 },
  { id: "veldsla-102", name: "Veldsla", cat: "Groente (vers)", supplier: "Sligro", unit: "bak", price: 4.5 },
  { id: "witlof-103", name: "Witlof", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 2.3 },
  { id: "rode-biet-104", name: "Rode biet", cat: "Groente (vers)", supplier: "Beide", unit: "kg", price: 1.7 },
  { id: "pompoen-105", name: "Pompoen", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 1.5 },
  { id: "champignons-wit-106", name: "Champignons wit", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 4.1 },
  { id: "kastanjechampignons-107", name: "Kastanjechampignons", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 4.8 },
  { id: "oesterzwam-108", name: "Oesterzwam", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 9.5 },
  { id: "shiitake-109", name: "Shiitake", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 12.0 },
  { id: "cantharel-seizoen-110", name: "Cantharel (seizoen)", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 28.0 },
  { id: "eekhoorntjesbrood-cep-111", name: "Eekhoorntjesbrood (cep)", cat: "Groente (vers)", supplier: "Beide", unit: "kg", price: 34.0 },
  { id: "asperges-wit-aa-112", name: "Asperges wit AA", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 9.8 },
  { id: "asperges-groen-113", name: "Asperges groen", cat: "Groente (vers)", supplier: "Sligro", unit: "kg", price: 7.5 },
  { id: "avocado-hass-114", name: "Avocado Hass", cat: "Groente (vers)", supplier: "Hanos", unit: "stuk", price: 0.95 },
  { id: "gember-vers-115", name: "Gember vers", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 6.5 },
  { id: "citroengras-stengels-116", name: "Citroengras (stengels)", cat: "Groente (vers)", supplier: "Hanos", unit: "kg", price: 14.0 },
  { id: "pak-choi-117", name: "Pak choi", cat: "Groente (vers)", supplier: "Beide", unit: "kg", price: 3.4 },
  { id: "mais-kolf-118", name: "Mais kolf", cat: "Groente (vers)", supplier: "Sligro", unit: "stuk", price: 1.1 },
  { id: "pastinaak-119", name: "Pastinaak", cat: "Groente (vers)", supplier: "Beide", unit: "kg", price: 2.2 },
  { id: "knolraap-120", name: "Knolraap", cat: "Groente (vers)", supplier: "Beide", unit: "kg", price: 1.6 },
  { id: "citroen-121", name: "Citroen", cat: "Fruit (vers)", supplier: "Beide", unit: "kg", price: 2.4 },
  { id: "limoen-122", name: "Limoen", cat: "Fruit (vers)", supplier: "Beide", unit: "kg", price: 4.2 },
  { id: "sinaasappel-pers-123", name: "Sinaasappel pers", cat: "Fruit (vers)", supplier: "Sligro", unit: "kg", price: 1.6 },
  { id: "granny-smith-appel-124", name: "Granny Smith appel", cat: "Fruit (vers)", supplier: "Sligro", unit: "kg", price: 1.9 },
  { id: "peer-conference-125", name: "Peer Conference", cat: "Fruit (vers)", supplier: "Beide", unit: "kg", price: 2.1 },
  { id: "banaan-126", name: "Banaan", cat: "Fruit (vers)", supplier: "Hanos", unit: "kg", price: 1.4 },
  { id: "aardbeien-127", name: "Aardbeien", cat: "Fruit (vers)", supplier: "Sligro", unit: "bak", price: 2.8 },
  { id: "frambozen-128", name: "Frambozen", cat: "Fruit (vers)", supplier: "Beide", unit: "bak", price: 3.5 },
  { id: "bramen-129", name: "Bramen", cat: "Fruit (vers)", supplier: "Hanos", unit: "bak", price: 3.6 },
  { id: "blauwe-bessen-130", name: "Blauwe bessen", cat: "Fruit (vers)", supplier: "Beide", unit: "bak", price: 3.2 },
  { id: "mango-131", name: "Mango", cat: "Fruit (vers)", supplier: "Sligro", unit: "stuk", price: 1.6 },
  { id: "ananas-132", name: "Ananas", cat: "Fruit (vers)", supplier: "Hanos", unit: "stuk", price: 2.2 },
  { id: "passievrucht-133", name: "Passievrucht", cat: "Fruit (vers)", supplier: "Sligro", unit: "kg", price: 9.5 },
  { id: "vijgen-vers-134", name: "Vijgen vers", cat: "Fruit (vers)", supplier: "Sligro", unit: "kg", price: 8.0 },
  { id: "druiven-pitloos-135", name: "Druiven pitloos", cat: "Fruit (vers)", supplier: "Hanos", unit: "kg", price: 3.8 },
  { id: "granaatappel-136", name: "Granaatappel", cat: "Fruit (vers)", supplier: "Sligro", unit: "stuk", price: 1.9 },
  { id: "yuzu-seizoen-137", name: "Yuzu (seizoen)", cat: "Fruit (vers)", supplier: "Sligro", unit: "kg", price: 38.0 },
  { id: "rabarber-138", name: "Rabarber", cat: "Fruit (vers)", supplier: "Beide", unit: "kg", price: 3.4 },
  { id: "meloen-cantaloupe-139", name: "Meloen cantaloupe", cat: "Fruit (vers)", supplier: "Hanos", unit: "stuk", price: 2.8 },
  { id: "kersen-140", name: "Kersen", cat: "Fruit (vers)", supplier: "Beide", unit: "kg", price: 7.5 },
  { id: "aardappel-vastkokend-nicola-141", name: "Aardappel vastkokend (Nicola)", cat: "Aardappel & Knollen", supplier: "Beide", unit: "kg", price: 1.1 },
  { id: "aardappel-kruimig-bintje-142", name: "Aardappel kruimig (Bintje)", cat: "Aardappel & Knollen", supplier: "Hanos", unit: "kg", price: 0.95 },
  { id: "krieltjes-143", name: "Krieltjes", cat: "Aardappel & Knollen", supplier: "Beide", unit: "kg", price: 1.6 },
  { id: "zoete-aardappel-144", name: "Zoete aardappel", cat: "Aardappel & Knollen", supplier: "Hanos", unit: "kg", price: 1.8 },
  { id: "frites-10mm-vers-145", name: "Frites 10mm vers", cat: "Aardappel & Knollen", supplier: "Beide", unit: "kg", price: 1.5 },
  { id: "pommes-noisette-dv-146", name: "Pommes noisette (dv)", cat: "Aardappel & Knollen", supplier: "Sligro", unit: "kg", price: 2.4 },
  { id: "aardappelpuree-vlokken-147", name: "Aardappelpuree vlokken", cat: "Aardappel & Knollen", supplier: "Sligro", unit: "zak", price: 6.5 },
  { id: "rosti-rauw-148", name: "Rösti rauw", cat: "Aardappel & Knollen", supplier: "Beide", unit: "kg", price: 2.9 },
  { id: "peterselie-platte-149", name: "Peterselie platte", cat: "Verse Kruiden", supplier: "Sligro", unit: "bos", price: 0.95 },
  { id: "peterselie-krul-150", name: "Peterselie krul", cat: "Verse Kruiden", supplier: "Hanos", unit: "bos", price: 0.95 },
  { id: "bieslook-151", name: "Bieslook", cat: "Verse Kruiden", supplier: "Hanos", unit: "bos", price: 1.4 },
  { id: "basilicum-152", name: "Basilicum", cat: "Verse Kruiden", supplier: "Beide", unit: "bak", price: 1.9 },
  { id: "koriander-153", name: "Koriander", cat: "Verse Kruiden", supplier: "Hanos", unit: "bos", price: 1.1 },
  { id: "munt-154", name: "Munt", cat: "Verse Kruiden", supplier: "Beide", unit: "bos", price: 1.2 },
  { id: "dille-155", name: "Dille", cat: "Verse Kruiden", supplier: "Sligro", unit: "bos", price: 1.3 },
  { id: "tijm-156", name: "Tijm", cat: "Verse Kruiden", supplier: "Sligro", unit: "bos", price: 1.6 },
  { id: "rozemarijn-157", name: "Rozemarijn", cat: "Verse Kruiden", supplier: "Beide", unit: "bos", price: 1.6 },
  { id: "salie-158", name: "Salie", cat: "Verse Kruiden", supplier: "Sligro", unit: "bos", price: 1.7 },
  { id: "dragon-159", name: "Dragon", cat: "Verse Kruiden", supplier: "Hanos", unit: "bos", price: 1.9 },
  { id: "kervel-160", name: "Kervel", cat: "Verse Kruiden", supplier: "Sligro", unit: "bos", price: 1.8 },
  { id: "laurier-vers-161", name: "Laurier vers", cat: "Verse Kruiden", supplier: "Beide", unit: "bos", price: 2.1 },
  { id: "oregano-vers-162", name: "Oregano vers", cat: "Verse Kruiden", supplier: "Hanos", unit: "bos", price: 1.7 },
  { id: "zwarte-peper-gemalen-163", name: "Zwarte peper gemalen", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 18.0 },
  { id: "zwarte-peperkorrels-164", name: "Zwarte peperkorrels", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 16.5 },
  { id: "witte-peper-165", name: "Witte peper", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 22.0 },
  { id: "paprikapoeder-zoet-166", name: "Paprikapoeder zoet", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "kg", price: 9.5 },
  { id: "paprikapoeder-gerookt-167", name: "Paprikapoeder gerookt", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 14.0 },
  { id: "komijn-gemalen-168", name: "Komijn gemalen", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 12.0 },
  { id: "korianderzaad-169", name: "Korianderzaad", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 10.5 },
  { id: "kurkuma-170", name: "Kurkuma", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 8.9 },
  { id: "kerrie-madras-171", name: "Kerrie madras", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "kg", price: 11.0 },
  { id: "garam-masala-172", name: "Garam masala", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "kg", price: 16.0 },
  { id: "kaneel-stokjes-173", name: "Kaneel stokjes", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "kg", price: 19.0 },
  { id: "kaneel-gemalen-174", name: "Kaneel gemalen", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 12.5 },
  { id: "nootmuskaat-heel-175", name: "Nootmuskaat heel", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 28.0 },
  { id: "kruidnagel-176", name: "Kruidnagel", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 24.0 },
  { id: "kardemom-groen-177", name: "Kardemom groen", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 42.0 },
  { id: "steranijs-178", name: "Steranijs", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "kg", price: 26.0 },
  { id: "venkelzaad-179", name: "Venkelzaad", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 11.0 },
  { id: "mosterdzaad-180", name: "Mosterdzaad", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 7.5 },
  { id: "chilivlokken-181", name: "Chilivlokken", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "kg", price: 13.0 },
  { id: "cayennepeper-182", name: "Cayennepeper", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "kg", price: 14.5 },
  { id: "saffraan-1g-183", name: "Saffraan (1g)", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "gram", price: 6.5 },
  { id: "vanillestokjes-10-st-184", name: "Vanillestokjes (10 st)", cat: "Specerijen & Droge Kruiden", supplier: "Beide", unit: "doos", price: 24.0 },
  { id: "laurierblad-gedroogd-185", name: "Laurierblad gedroogd", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "kg", price: 12.0 },
  { id: "italiaanse-kruidenmix-186", name: "Italiaanse kruidenmix", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 9.5 },
  { id: "proven-aalse-kruiden-187", name: "Provençaalse kruiden", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 9.0 },
  { id: "ras-el-hanout-188", name: "Ras el hanout", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 17.0 },
  { id: "za-atar-189", name: "Za'atar", cat: "Specerijen & Droge Kruiden", supplier: "Sligro", unit: "kg", price: 16.0 },
  { id: "sumak-190", name: "Sumak", cat: "Specerijen & Droge Kruiden", supplier: "Hanos", unit: "kg", price: 15.0 },
  { id: "fijn-zeezout-191", name: "Fijn zeezout", cat: "Zout & Basis", supplier: "Beide", unit: "kg", price: 1.4 },
  { id: "grof-zeezout-192", name: "Grof zeezout", cat: "Zout & Basis", supplier: "Hanos", unit: "kg", price: 1.6 },
  { id: "fleur-de-sel-193", name: "Fleur de sel", cat: "Zout & Basis", supplier: "Sligro", unit: "kg", price: 18.0 },
  { id: "maldon-zoutvlokken-194", name: "Maldon zoutvlokken", cat: "Zout & Basis", supplier: "Beide", unit: "kg", price: 22.0 },
  { id: "peper-zout-mix-195", name: "Peper-zout mix", cat: "Zout & Basis", supplier: "Beide", unit: "kg", price: 6.0 },
  { id: "bakpoeder-196", name: "Bakpoeder", cat: "Zout & Basis", supplier: "Sligro", unit: "kg", price: 4.2 },
  { id: "baksoda-197", name: "Baksoda", cat: "Zout & Basis", supplier: "Hanos", unit: "kg", price: 3.8 },
  { id: "gist-vers-198", name: "Gist vers", cat: "Zout & Basis", supplier: "Hanos", unit: "kg", price: 5.5 },
  { id: "gist-gedroogd-199", name: "Gist gedroogd", cat: "Zout & Basis", supplier: "Beide", unit: "kg", price: 9.5 },
  { id: "volle-melk-200", name: "Volle melk", cat: "Zuivel", supplier: "Hanos", unit: "L", price: 1.1 },
  { id: "halfvolle-melk-201", name: "Halfvolle melk", cat: "Zuivel", supplier: "Beide", unit: "L", price: 1.0 },
  { id: "slagroom-35-202", name: "Slagroom 35%", cat: "Zuivel", supplier: "Sligro", unit: "L", price: 4.2 },
  { id: "kookroom-20-203", name: "Kookroom 20%", cat: "Zuivel", supplier: "Beide", unit: "L", price: 2.9 },
  { id: "creme-fraiche-204", name: "Crème fraîche", cat: "Zuivel", supplier: "Sligro", unit: "kg", price: 5.5 },
  { id: "zure-room-205", name: "Zure room", cat: "Zuivel", supplier: "Sligro", unit: "kg", price: 4.8 },
  { id: "karnemelk-206", name: "Karnemelk", cat: "Zuivel", supplier: "Beide", unit: "L", price: 1.2 },
  { id: "roomboter-ongezouten-207", name: "Roomboter ongezouten", cat: "Zuivel", supplier: "Beide", unit: "kg", price: 9.8 },
  { id: "roomboter-gezouten-208", name: "Roomboter gezouten", cat: "Zuivel", supplier: "Sligro", unit: "kg", price: 9.9 },
  { id: "geklaarde-boter-ghee-209", name: "Geklaarde boter / ghee", cat: "Zuivel", supplier: "Hanos", unit: "kg", price: 13.5 },
  { id: "mascarpone-210", name: "Mascarpone", cat: "Zuivel", supplier: "Sligro", unit: "kg", price: 7.8 },
  { id: "ricotta-211", name: "Ricotta", cat: "Zuivel", supplier: "Beide", unit: "kg", price: 6.5 },
  { id: "yoghurt-griekse-212", name: "Yoghurt Griekse", cat: "Zuivel", supplier: "Beide", unit: "kg", price: 4.9 },
  { id: "hangop-kwark-213", name: "Hangop / kwark", cat: "Zuivel", supplier: "Beide", unit: "kg", price: 4.2 },
  { id: "buffelmozzarella-214", name: "Buffelmozzarella", cat: "Zuivel", supplier: "Beide", unit: "kg", price: 12.0 },
  { id: "burrata-per-stuk-215", name: "Burrata (per stuk)", cat: "Zuivel", supplier: "Beide", unit: "stuk", price: 2.8 },
  { id: "parmigiano-reggiano-24mnd-216", name: "Parmigiano Reggiano 24mnd", cat: "Kaas", supplier: "Sligro", unit: "kg", price: 22.0 },
  { id: "grana-padano-217", name: "Grana Padano", cat: "Kaas", supplier: "Sligro", unit: "kg", price: 16.5 },
  { id: "pecorino-romano-218", name: "Pecorino Romano", cat: "Kaas", supplier: "Beide", unit: "kg", price: 19.0 },
  { id: "gruyere-aop-219", name: "Gruyère AOP", cat: "Kaas", supplier: "Beide", unit: "kg", price: 18.5 },
  { id: "comte-18mnd-220", name: "Comté 18mnd", cat: "Kaas", supplier: "Hanos", unit: "kg", price: 21.0 },
  { id: "emmentaler-221", name: "Emmentaler", cat: "Kaas", supplier: "Hanos", unit: "kg", price: 11.5 },
  { id: "cheddar-mature-222", name: "Cheddar mature", cat: "Kaas", supplier: "Beide", unit: "kg", price: 12.0 },
  { id: "gouda-jong-belegen-223", name: "Gouda jong belegen", cat: "Kaas", supplier: "Sligro", unit: "kg", price: 8.5 },
  { id: "oude-gouda-224", name: "Oude Gouda", cat: "Kaas", supplier: "Hanos", unit: "kg", price: 12.5 },
  { id: "brie-de-meaux-225", name: "Brie de Meaux", cat: "Kaas", supplier: "Sligro", unit: "kg", price: 14.0 },
  { id: "camembert-226", name: "Camembert", cat: "Kaas", supplier: "Sligro", unit: "kg", price: 13.0 },
  { id: "gorgonzola-dolce-227", name: "Gorgonzola dolce", cat: "Kaas", supplier: "Hanos", unit: "kg", price: 15.0 },
  { id: "roquefort-aop-228", name: "Roquefort AOP", cat: "Kaas", supplier: "Sligro", unit: "kg", price: 24.0 },
  { id: "geitenkaas-log-229", name: "Geitenkaas log", cat: "Kaas", supplier: "Hanos", unit: "kg", price: 13.5 },
  { id: "feta-griekse-pdo-230", name: "Feta (Griekse PDO)", cat: "Kaas", supplier: "Beide", unit: "kg", price: 9.8 },
  { id: "halloumi-231", name: "Halloumi", cat: "Kaas", supplier: "Beide", unit: "kg", price: 11.0 },
  { id: "mozzarella-fior-di-latte-232", name: "Mozzarella fior di latte", cat: "Kaas", supplier: "Sligro", unit: "kg", price: 7.5 },
  { id: "manchego-curado-233", name: "Manchego curado", cat: "Kaas", supplier: "Beide", unit: "kg", price: 19.5 },
  { id: "scharreleieren-m-tray-30-234", name: "Scharreleieren M (tray 30)", cat: "Eieren", supplier: "Beide", unit: "tray", price: 7.2 },
  { id: "vrije-uitloop-eieren-l-tray-30-235", name: "Vrije uitloop eieren L (tray 30)", cat: "Eieren", supplier: "Hanos", unit: "tray", price: 9.5 },
  { id: "eidooier-pasteurised-236", name: "Eidooier pasteurised", cat: "Eieren", supplier: "Sligro", unit: "L", price: 8.5 },
  { id: "eiwit-pasteurised-237", name: "Eiwit pasteurised", cat: "Eieren", supplier: "Beide", unit: "L", price: 4.5 },
  { id: "heel-ei-vloeibaar-238", name: "Heel ei vloeibaar", cat: "Eieren", supplier: "Hanos", unit: "L", price: 5.8 },
  { id: "kwarteleitjes-24-st-239", name: "Kwarteleitjes (24 st)", cat: "Eieren", supplier: "Beide", unit: "doos", price: 6.5 },
  { id: "extra-vergine-olijfolie-240", name: "Extra vergine olijfolie", cat: "Oliën & Vetten", supplier: "Beide", unit: "L", price: 9.5 },
  { id: "olijfolie-mild-bak-241", name: "Olijfolie mild (bak)", cat: "Oliën & Vetten", supplier: "Hanos", unit: "L", price: 6.5 },
  { id: "zonnebloemolie-242", name: "Zonnebloemolie", cat: "Oliën & Vetten", supplier: "Sligro", unit: "L", price: 2.8 },
  { id: "arachideolie-frituur-243", name: "Arachideolie (frituur)", cat: "Oliën & Vetten", supplier: "Sligro", unit: "L", price: 3.5 },
  { id: "raapzaad-koolzaadolie-244", name: "Raapzaad/koolzaadolie", cat: "Oliën & Vetten", supplier: "Sligro", unit: "L", price: 3.2 },
  { id: "truffelolie-wit-245", name: "Truffelolie wit", cat: "Oliën & Vetten", supplier: "Beide", unit: "fles", price: 12.0 },
  { id: "sesamolie-geroosterd-246", name: "Sesamolie geroosterd", cat: "Oliën & Vetten", supplier: "Beide", unit: "fles", price: 9.5 },
  { id: "walnootolie-247", name: "Walnootolie", cat: "Oliën & Vetten", supplier: "Hanos", unit: "fles", price: 14.0 },
  { id: "frituurvet-vast-248", name: "Frituurvet vast", cat: "Oliën & Vetten", supplier: "Beide", unit: "kg", price: 2.4 },
  { id: "kokosolie-249", name: "Kokosolie", cat: "Oliën & Vetten", supplier: "Hanos", unit: "kg", price: 6.8 },
  { id: "balsamico-di-modena-igp-250", name: "Balsamico di Modena IGP", cat: "Azijn & Zuren", supplier: "Hanos", unit: "fles", price: 7.5 },
  { id: "balsamico-crema-251", name: "Balsamico crema", cat: "Azijn & Zuren", supplier: "Beide", unit: "fles", price: 6.0 },
  { id: "witte-wijnazijn-252", name: "Witte wijnazijn", cat: "Azijn & Zuren", supplier: "Hanos", unit: "L", price: 3.2 },
  { id: "rode-wijnazijn-253", name: "Rode wijnazijn", cat: "Azijn & Zuren", supplier: "Hanos", unit: "L", price: 3.4 },
  { id: "sherryazijn-254", name: "Sherryazijn", cat: "Azijn & Zuren", supplier: "Sligro", unit: "fles", price: 6.5 },
  { id: "appelazijn-255", name: "Appelazijn", cat: "Azijn & Zuren", supplier: "Sligro", unit: "L", price: 3.0 },
  { id: "rijstazijn-256", name: "Rijstazijn", cat: "Azijn & Zuren", supplier: "Beide", unit: "fles", price: 4.5 },
  { id: "citroensap-concentraat-257", name: "Citroensap concentraat", cat: "Azijn & Zuren", supplier: "Hanos", unit: "L", price: 4.8 },
  { id: "sojasaus-kikkoman-258", name: "Sojasaus (Kikkoman)", cat: "Sauzen & Condimenten", supplier: "Sligro", unit: "fles", price: 5.5 },
  { id: "ketjap-manis-259", name: "Ketjap manis", cat: "Sauzen & Condimenten", supplier: "Sligro", unit: "fles", price: 5.0 },
  { id: "vissaus-nam-pla-260", name: "Vissaus (nam pla)", cat: "Sauzen & Condimenten", supplier: "Sligro", unit: "fles", price: 4.2 },
  { id: "oestersaus-261", name: "Oestersaus", cat: "Sauzen & Condimenten", supplier: "Sligro", unit: "fles", price: 4.8 },
  { id: "sriracha-262", name: "Sriracha", cat: "Sauzen & Condimenten", supplier: "Hanos", unit: "fles", price: 4.0 },
  { id: "sambal-oelek-263", name: "Sambal oelek", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "pot", price: 4.5 },
  { id: "worcestershire-saus-264", name: "Worcestershire saus", cat: "Sauzen & Condimenten", supplier: "Sligro", unit: "fles", price: 5.2 },
  { id: "tabasco-265", name: "Tabasco", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "fles", price: 6.5 },
  { id: "dijonmosterd-266", name: "Dijonmosterd", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "pot", price: 4.8 },
  { id: "grove-mosterd-267", name: "Grove mosterd", cat: "Sauzen & Condimenten", supplier: "Sligro", unit: "pot", price: 4.5 },
  { id: "mayonaise-10kg-emmer-268", name: "Mayonaise (10kg emmer)", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "emmer", price: 32.0 },
  { id: "ketchup-5l-269", name: "Ketchup (5L)", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "can", price: 11.0 },
  { id: "tomatenpuree-3x-270", name: "Tomatenpuree (3x)", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "blik", price: 5.5 },
  { id: "pesto-genovese-271", name: "Pesto genovese", cat: "Sauzen & Condimenten", supplier: "Hanos", unit: "pot", price: 6.5 },
  { id: "tahini-272", name: "Tahini", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "pot", price: 7.0 },
  { id: "hoisinsaus-273", name: "Hoisinsaus", cat: "Sauzen & Condimenten", supplier: "Sligro", unit: "fles", price: 4.9 },
  { id: "teriyakisaus-274", name: "Teriyakisaus", cat: "Sauzen & Condimenten", supplier: "Sligro", unit: "fles", price: 5.2 },
  { id: "honing-acacia-275", name: "Honing (acacia)", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "kg", price: 9.5 },
  { id: "ahornsiroop-276", name: "Ahornsiroop", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "fles", price: 9.0 },
  { id: "miso-wit-shiro-277", name: "Miso wit (shiro)", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "kg", price: 12.0 },
  { id: "miso-rood-278", name: "Miso rood", cat: "Sauzen & Condimenten", supplier: "Beide", unit: "kg", price: 13.5 },
  { id: "spaghetti-de-cecco-279", name: "Spaghetti (De Cecco)", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 2.4 },
  { id: "penne-rigate-280", name: "Penne rigate", cat: "Pasta, Rijst & Granen", supplier: "Sligro", unit: "kg", price: 2.3 },
  { id: "tagliatelle-nido-281", name: "Tagliatelle nido", cat: "Pasta, Rijst & Granen", supplier: "Hanos", unit: "kg", price: 3.1 },
  { id: "linguine-282", name: "Linguine", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 2.6 },
  { id: "risottorijst-arborio-283", name: "Risottorijst Arborio", cat: "Pasta, Rijst & Granen", supplier: "Hanos", unit: "kg", price: 3.8 },
  { id: "carnaroli-rijst-284", name: "Carnaroli rijst", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 4.9 },
  { id: "sushirijst-koshihikari-285", name: "Sushirijst koshihikari", cat: "Pasta, Rijst & Granen", supplier: "Sligro", unit: "kg", price: 3.95 },
  { id: "basmati-rijst-286", name: "Basmati rijst", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 2.9 },
  { id: "jasmijnrijst-287", name: "Jasmijnrijst", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 2.7 },
  { id: "paella-rijst-bomba-288", name: "Paella rijst (bomba)", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 5.5 },
  { id: "polenta-maisgriesmeel-289", name: "Polenta (maïsgriesmeel)", cat: "Pasta, Rijst & Granen", supplier: "Hanos", unit: "kg", price: 2.8 },
  { id: "couscous-290", name: "Couscous", cat: "Pasta, Rijst & Granen", supplier: "Sligro", unit: "kg", price: 2.6 },
  { id: "bulgur-291", name: "Bulgur", cat: "Pasta, Rijst & Granen", supplier: "Hanos", unit: "kg", price: 2.9 },
  { id: "quinoa-292", name: "Quinoa", cat: "Pasta, Rijst & Granen", supplier: "Sligro", unit: "kg", price: 5.5 },
  { id: "parelgort-293", name: "Parelgort", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 2.4 },
  { id: "havermout-294", name: "Havermout", cat: "Pasta, Rijst & Granen", supplier: "Hanos", unit: "kg", price: 2.1 },
  { id: "lasagnebladen-295", name: "Lasagnebladen", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 3.2 },
  { id: "gnocchi-vers-296", name: "Gnocchi vers", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 4.5 },
  { id: "noedels-egg-297", name: "Noedels (egg) ", cat: "Pasta, Rijst & Granen", supplier: "Beide", unit: "kg", price: 3.4 },
  { id: "rijstnoedels-298", name: "Rijstnoedels", cat: "Pasta, Rijst & Granen", supplier: "Sligro", unit: "kg", price: 3.8 },
  { id: "panko-paneermeel-299", name: "Panko paneermeel", cat: "Pasta, Rijst & Granen", supplier: "Hanos", unit: "kg", price: 4.2 },
  { id: "paneermeel-fijn-300", name: "Paneermeel fijn", cat: "Pasta, Rijst & Granen", supplier: "Hanos", unit: "kg", price: 2.4 },
  { id: "kikkererwten-gedroogd-301", name: "Kikkererwten gedroogd", cat: "Peulvruchten & Conserven", supplier: "Sligro", unit: "kg", price: 2.8 },
  { id: "kikkererwten-blik-2-5kg-302", name: "Kikkererwten blik (2.5kg)", cat: "Peulvruchten & Conserven", supplier: "Hanos", unit: "blik", price: 5.5 },
  { id: "witte-bonen-blik-303", name: "Witte bonen blik", cat: "Peulvruchten & Conserven", supplier: "Sligro", unit: "blik", price: 4.8 },
  { id: "bruine-linzen-304", name: "Bruine linzen", cat: "Peulvruchten & Conserven", supplier: "Beide", unit: "kg", price: 3.2 },
  { id: "beluga-linzen-305", name: "Beluga linzen", cat: "Peulvruchten & Conserven", supplier: "Hanos", unit: "kg", price: 5.5 },
  { id: "rode-linzen-306", name: "Rode linzen", cat: "Peulvruchten & Conserven", supplier: "Beide", unit: "kg", price: 3.4 },
  { id: "zwarte-bonen-blik-307", name: "Zwarte bonen blik", cat: "Peulvruchten & Conserven", supplier: "Hanos", unit: "blik", price: 4.9 },
  { id: "cannellini-bonen-308", name: "Cannellini bonen", cat: "Peulvruchten & Conserven", supplier: "Hanos", unit: "blik", price: 5.0 },
  { id: "tomaten-gepeld-3x-a10-309", name: "Tomaten gepeld (3x A10)", cat: "Peulvruchten & Conserven", supplier: "Beide", unit: "blik", price: 6.5 },
  { id: "tomatenblokjes-3x-310", name: "Tomatenblokjes (3x)", cat: "Peulvruchten & Conserven", supplier: "Beide", unit: "blik", price: 6.2 },
  { id: "passata-di-pomodoro-311", name: "Passata di pomodoro", cat: "Peulvruchten & Conserven", supplier: "Hanos", unit: "fles", price: 2.8 },
  { id: "artisjokharten-op-olie-312", name: "Artisjokharten op olie", cat: "Peulvruchten & Conserven", supplier: "Sligro", unit: "pot", price: 7.5 },
  { id: "olijven-kalamata-ontpit-313", name: "Olijven kalamata ontpit", cat: "Peulvruchten & Conserven", supplier: "Hanos", unit: "kg", price: 8.5 },
  { id: "groene-olijven-314", name: "Groene olijven", cat: "Peulvruchten & Conserven", supplier: "Sligro", unit: "kg", price: 7.5 },
  { id: "kappertjes-315", name: "Kappertjes", cat: "Peulvruchten & Conserven", supplier: "Sligro", unit: "pot", price: 6.5 },
  { id: "ansjovisfilet-op-olie-316", name: "Ansjovisfilet op olie", cat: "Peulvruchten & Conserven", supplier: "Sligro", unit: "blik", price: 5.8 },
  { id: "tonijn-in-olie-a10-317", name: "Tonijn in olie (A10)", cat: "Peulvruchten & Conserven", supplier: "Sligro", unit: "blik", price: 12.5 },
  { id: "mais-blik-318", name: "Mais blik", cat: "Peulvruchten & Conserven", supplier: "Hanos", unit: "blik", price: 4.2 },
  { id: "cornichons-319", name: "Cornichons", cat: "Peulvruchten & Conserven", supplier: "Beide", unit: "pot", price: 5.5 },
  { id: "zongedroogde-tomaten-320", name: "Zongedroogde tomaten", cat: "Peulvruchten & Conserven", supplier: "Sligro", unit: "pot", price: 7.8 },
  { id: "amandelen-blank-321", name: "Amandelen blank", cat: "Noten, Zaden & Pitten", supplier: "Hanos", unit: "kg", price: 12.5 },
  { id: "amandelschaafsel-322", name: "Amandelschaafsel", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 13.0 },
  { id: "walnoten-323", name: "Walnoten", cat: "Noten, Zaden & Pitten", supplier: "Sligro", unit: "kg", price: 14.0 },
  { id: "hazelnoten-324", name: "Hazelnoten", cat: "Noten, Zaden & Pitten", supplier: "Sligro", unit: "kg", price: 13.5 },
  { id: "pistache-ongezouten-325", name: "Pistache ongezouten", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 22.0 },
  { id: "cashew-326", name: "Cashew", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 14.5 },
  { id: "pijnboompitten-327", name: "Pijnboompitten", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 32.0 },
  { id: "pecannoten-328", name: "Pecannoten", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 18.0 },
  { id: "sesamzaad-329", name: "Sesamzaad", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 11.0 },
  { id: "zwart-sesamzaad-330", name: "Zwart sesamzaad", cat: "Noten, Zaden & Pitten", supplier: "Hanos", unit: "kg", price: 16.0 },
  { id: "zonnebloempitten-331", name: "Zonnebloempitten", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 4.5 },
  { id: "pompoenpitten-332", name: "Pompoenpitten", cat: "Noten, Zaden & Pitten", supplier: "Hanos", unit: "kg", price: 8.5 },
  { id: "lijnzaad-333", name: "Lijnzaad", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 4.2 },
  { id: "chiazaad-334", name: "Chiazaad", cat: "Noten, Zaden & Pitten", supplier: "Hanos", unit: "kg", price: 9.5 },
  { id: "kokosrasp-335", name: "Kokosrasp", cat: "Noten, Zaden & Pitten", supplier: "Beide", unit: "kg", price: 5.5 },
  { id: "tarwebloem-patent-336", name: "Tarwebloem patent", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "kg", price: 1.2 },
  { id: "volkorenmeel-337", name: "Volkorenmeel", cat: "Bakkerij, Meel & Bloem", supplier: "Sligro", unit: "kg", price: 1.4 },
  { id: "tipo-00-pizzabloem-338", name: "Tipo 00 pizzabloem", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "kg", price: 1.9 },
  { id: "maizena-339", name: "Maïzena", cat: "Bakkerij, Meel & Bloem", supplier: "Sligro", unit: "kg", price: 2.4 },
  { id: "rijstmeel-340", name: "Rijstmeel", cat: "Bakkerij, Meel & Bloem", supplier: "Sligro", unit: "kg", price: 3.2 },
  { id: "amandelmeel-341", name: "Amandelmeel", cat: "Bakkerij, Meel & Bloem", supplier: "Sligro", unit: "kg", price: 14.0 },
  { id: "griesmeel-semolina-342", name: "Griesmeel (semolina)", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "kg", price: 2.2 },
  { id: "roggemeel-343", name: "Roggemeel", cat: "Bakkerij, Meel & Bloem", supplier: "Sligro", unit: "kg", price: 1.8 },
  { id: "speltbloem-344", name: "Speltbloem", cat: "Bakkerij, Meel & Bloem", supplier: "Hanos", unit: "kg", price: 2.6 },
  { id: "gelatine-blaadjes-345", name: "Gelatine blaadjes", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "doos", price: 9.5 },
  { id: "agar-agar-346", name: "Agar agar", cat: "Bakkerij, Meel & Bloem", supplier: "Sligro", unit: "kg", price: 28.0 },
  { id: "xanthaangom-347", name: "Xanthaangom", cat: "Bakkerij, Meel & Bloem", supplier: "Sligro", unit: "kg", price: 24.0 },
  { id: "cacaopoeder-348", name: "Cacaopoeder", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "kg", price: 9.5 },
  { id: "pure-chocolade-70-callets-349", name: "Pure chocolade 70% (callets)", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "kg", price: 11.5 },
  { id: "melkchocolade-callets-350", name: "Melkchocolade callets", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "kg", price: 10.5 },
  { id: "witte-chocolade-callets-351", name: "Witte chocolade callets", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "kg", price: 11.0 },
  { id: "bakpapier-rollen-352", name: "Bakpapier rollen", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "rol", price: 6.5 },
  { id: "croissant-deeg-rauw-dv-353", name: "Croissant deeg rauw (dv)", cat: "Bakkerij, Meel & Bloem", supplier: "Beide", unit: "doos", price: 18.0 },
  { id: "kristalsuiker-354", name: "Kristalsuiker", cat: "Suiker & Zoetwaren", supplier: "Sligro", unit: "kg", price: 1.3 },
  { id: "basterdsuiker-bruin-355", name: "Basterdsuiker bruin", cat: "Suiker & Zoetwaren", supplier: "Beide", unit: "kg", price: 1.6 },
  { id: "poedersuiker-356", name: "Poedersuiker", cat: "Suiker & Zoetwaren", supplier: "Beide", unit: "kg", price: 1.9 },
  { id: "rietsuiker-ruw-357", name: "Rietsuiker ruw", cat: "Suiker & Zoetwaren", supplier: "Beide", unit: "kg", price: 2.4 },
  { id: "glucosestroop-358", name: "Glucosestroop", cat: "Suiker & Zoetwaren", supplier: "Beide", unit: "kg", price: 3.5 },
  { id: "honingraat-359", name: "Honingraat", cat: "Suiker & Zoetwaren", supplier: "Hanos", unit: "stuk", price: 6.5 },
  { id: "fondant-360", name: "Fondant", cat: "Suiker & Zoetwaren", supplier: "Sligro", unit: "kg", price: 4.2 },
  { id: "marsepein-361", name: "Marsepein", cat: "Suiker & Zoetwaren", supplier: "Sligro", unit: "kg", price: 6.5 },
  { id: "vanille-extract-362", name: "Vanille-extract", cat: "Suiker & Zoetwaren", supplier: "Beide", unit: "fles", price: 14.0 },
  { id: "amandelpasta-363", name: "Amandelpasta", cat: "Suiker & Zoetwaren", supplier: "Hanos", unit: "kg", price: 7.5 },
  { id: "nori-vellen-50-st-364", name: "Nori vellen (50 st)", cat: "Aziatisch & Wereldkeuken", supplier: "Beide", unit: "doos", price: 9.5 },
  { id: "wakame-gedroogd-365", name: "Wakame gedroogd", cat: "Aziatisch & Wereldkeuken", supplier: "Beide", unit: "zak", price: 8.5 },
  { id: "dashi-poeder-366", name: "Dashi poeder", cat: "Aziatisch & Wereldkeuken", supplier: "Hanos", unit: "pot", price: 7.5 },
  { id: "mirin-367", name: "Mirin", cat: "Aziatisch & Wereldkeuken", supplier: "Hanos", unit: "fles", price: 9.5 },
  { id: "sake-kook-368", name: "Sake (kook)", cat: "Aziatisch & Wereldkeuken", supplier: "Sligro", unit: "fles", price: 14.0 },
  { id: "rijstwijn-shaoxing-369", name: "Rijstwijn shaoxing", cat: "Aziatisch & Wereldkeuken", supplier: "Hanos", unit: "fles", price: 6.5 },
  { id: "wasabipasta-370", name: "Wasabipasta", cat: "Aziatisch & Wereldkeuken", supplier: "Hanos", unit: "tube", price: 5.5 },
  { id: "gember-gepekeld-gari-371", name: "Gember gepekeld (gari)", cat: "Aziatisch & Wereldkeuken", supplier: "Hanos", unit: "pot", price: 6.0 },
  { id: "currypasta-rood-thai-372", name: "Currypasta rood (Thai)", cat: "Aziatisch & Wereldkeuken", supplier: "Sligro", unit: "pot", price: 5.2 },
  { id: "currypasta-groen-373", name: "Currypasta groen", cat: "Aziatisch & Wereldkeuken", supplier: "Beide", unit: "pot", price: 5.2 },
  { id: "kokosmelk-a10-3x-374", name: "Kokosmelk (A10/3x)", cat: "Aziatisch & Wereldkeuken", supplier: "Beide", unit: "blik", price: 6.8 },
  { id: "tamarindepasta-375", name: "Tamarindepasta", cat: "Aziatisch & Wereldkeuken", supplier: "Beide", unit: "pot", price: 5.5 },
  { id: "gochujang-376", name: "Gochujang", cat: "Aziatisch & Wereldkeuken", supplier: "Sligro", unit: "pot", price: 6.5 },
  { id: "kimchi-377", name: "Kimchi", cat: "Aziatisch & Wereldkeuken", supplier: "Beide", unit: "kg", price: 8.5 },
  { id: "tofu-stevig-378", name: "Tofu stevig", cat: "Aziatisch & Wereldkeuken", supplier: "Beide", unit: "kg", price: 4.5 },
  { id: "tortilla-wraps-18x-379", name: "Tortilla wraps (18x)", cat: "Aziatisch & Wereldkeuken", supplier: "Hanos", unit: "pak", price: 4.8 },
  { id: "wonton-vellen-380", name: "Wonton vellen", cat: "Aziatisch & Wereldkeuken", supplier: "Hanos", unit: "pak", price: 4.2 },
  { id: "bao-buns-dv-381", name: "Bao buns (dv)", cat: "Aziatisch & Wereldkeuken", supplier: "Sligro", unit: "doos", price: 12.0 },
  { id: "kippenfond-basis-382", name: "Kippenfond basis", cat: "Bouillon & Fonds", supplier: "Beide", unit: "L", price: 6.5 },
  { id: "kalfsfond-bruin-383", name: "Kalfsfond bruin", cat: "Bouillon & Fonds", supplier: "Beide", unit: "L", price: 9.5 },
  { id: "groentebouillon-384", name: "Groentebouillon", cat: "Bouillon & Fonds", supplier: "Hanos", unit: "L", price: 5.5 },
  { id: "visfumet-385", name: "Visfumet", cat: "Bouillon & Fonds", supplier: "Hanos", unit: "L", price: 8.5 },
  { id: "demi-glace-386", name: "Demi-glace", cat: "Bouillon & Fonds", supplier: "Hanos", unit: "pot", price: 18.0 },
  { id: "runderbouillon-pasta-387", name: "Runderbouillon pasta", cat: "Bouillon & Fonds", supplier: "Beide", unit: "pot", price: 14.0 },
  { id: "gevogeltejus-388", name: "Gevogeltejus", cat: "Bouillon & Fonds", supplier: "Sligro", unit: "pot", price: 19.0 },
  { id: "bladerdeeg-plakken-dv-389", name: "Bladerdeeg plakken (dv)", cat: "Diepvries", supplier: "Sligro", unit: "doos", price: 9.5 },
  { id: "filodeeg-dv-390", name: "Filodeeg (dv)", cat: "Diepvries", supplier: "Sligro", unit: "pak", price: 5.5 },
  { id: "doperwten-fijn-dv-391", name: "Doperwten fijn (dv)", cat: "Diepvries", supplier: "Beide", unit: "kg", price: 2.4 },
  { id: "spinazie-a-la-creme-dv-392", name: "Spinazie à la crème (dv)", cat: "Diepvries", supplier: "Beide", unit: "kg", price: 3.2 },
  { id: "frambozen-dv-393", name: "Frambozen (dv)", cat: "Diepvries", supplier: "Beide", unit: "kg", price: 6.5 },
  { id: "gemengd-zomerfruit-dv-394", name: "Gemengd zomerfruit (dv)", cat: "Diepvries", supplier: "Hanos", unit: "kg", price: 5.8 },
  { id: "frites-10mm-dv-395", name: "Frites 10mm (dv)", cat: "Diepvries", supplier: "Hanos", unit: "kg", price: 1.6 },
  { id: "garnalen-26-30-dv-396", name: "Garnalen 26/30 (dv)", cat: "Diepvries", supplier: "Sligro", unit: "kg", price: 16.0 },
  { id: "edamame-dv-397", name: "Edamame (dv)", cat: "Diepvries", supplier: "Sligro", unit: "kg", price: 5.5 },
  { id: "vanille-ijs-basis-dv-398", name: "Vanille-ijs basis (dv)", cat: "Diepvries", supplier: "Hanos", unit: "bak", price: 8.5 },
  { id: "tonic-water-24x-399", name: "Tonic water (24x)", cat: "Dranken (non-alcohol)", supplier: "Beide", unit: "tray", price: 18.0 },
  { id: "spa-rood-24x-400", name: "Spa rood (24x)", cat: "Dranken (non-alcohol)", supplier: "Hanos", unit: "tray", price: 9.5 },
  { id: "spa-blauw-24x-401", name: "Spa blauw (24x)", cat: "Dranken (non-alcohol)", supplier: "Beide", unit: "tray", price: 9.0 },
  { id: "sinaasappelsap-vers-402", name: "Sinaasappelsap vers", cat: "Dranken (non-alcohol)", supplier: "Sligro", unit: "L", price: 3.5 },
  { id: "appelsap-troebel-403", name: "Appelsap troebel", cat: "Dranken (non-alcohol)", supplier: "Beide", unit: "L", price: 2.4 },
  { id: "cola-24x-404", name: "Cola (24x)", cat: "Dranken (non-alcohol)", supplier: "Hanos", unit: "tray", price: 16.0 },
  { id: "gemberbier-24x-405", name: "Gemberbier (24x)", cat: "Dranken (non-alcohol)", supplier: "Sligro", unit: "tray", price: 19.0 },
  { id: "espressobonen-1kg-406", name: "Espressobonen (1kg)", cat: "Dranken (non-alcohol)", supplier: "Beide", unit: "kg", price: 18.0 },
  { id: "losse-thee-assorti-407", name: "Losse thee assorti", cat: "Dranken (non-alcohol)", supplier: "Beide", unit: "pot", price: 9.5 },
  { id: "kombucha-408", name: "Kombucha", cat: "Dranken (non-alcohol)", supplier: "Beide", unit: "fles", price: 3.2 },
  { id: "witte-kookwijn-409", name: "Witte kookwijn", cat: "Wijn & Gedistilleerd (kook)", supplier: "Hanos", unit: "fles", price: 4.5 },
  { id: "rode-kookwijn-410", name: "Rode kookwijn", cat: "Wijn & Gedistilleerd (kook)", supplier: "Hanos", unit: "fles", price: 4.8 },
  { id: "port-kook-411", name: "Port (kook)", cat: "Wijn & Gedistilleerd (kook)", supplier: "Beide", unit: "fles", price: 9.5 },
  { id: "madeira-412", name: "Madeira", cat: "Wijn & Gedistilleerd (kook)", supplier: "Beide", unit: "fles", price: 11.0 },
  { id: "cognac-kook-413", name: "Cognac (kook)", cat: "Wijn & Gedistilleerd (kook)", supplier: "Hanos", unit: "fles", price: 22.0 },
  { id: "pernod-pastis-414", name: "Pernod / pastis", cat: "Wijn & Gedistilleerd (kook)", supplier: "Hanos", unit: "fles", price: 16.0 },
  { id: "marsala-415", name: "Marsala", cat: "Wijn & Gedistilleerd (kook)", supplier: "Beide", unit: "fles", price: 9.0 },
  { id: "sherry-fino-416", name: "Sherry (fino)", cat: "Wijn & Gedistilleerd (kook)", supplier: "Hanos", unit: "fles", price: 8.5 },
];
const ING_CATS = ["Alle", ...Array.from(new Set(INGREDIENTS.map((i) => i.cat)))];
const ING_SUPPLIERS = ["Alle", "Hanos", "Sligro", "Beide"];


const SUPPLIER_META = {
  salmon: { name: "Atlantic Salmon Fillet", supplier: "Sligro", unit: "kg" }, miso: { name: "White Miso Paste", supplier: "Tokyo Foods", unit: "kg" },
  butter: { name: "Roomboter (Beurre)", supplier: "Leverancier X", unit: "kg" }, mirin: { name: "Mirin", supplier: "Tokyo Foods", unit: "L" },
  rice: { name: "Sushi Rice", supplier: "Sligro", unit: "kg" }, sesame: { name: "Sesame Seeds", supplier: "Hanos", unit: "kg" },
};

const INITIAL_HACCP = [
  { id: "h1", zone: "Koeling 1 · vis", target: "≤ 4 °C", limit: 4, cmp: "lte", unit: "°C", value: "", time: "", status: "pending" },
  { id: "h2", zone: "Vriezer", target: "≤ -18 °C", limit: -18, cmp: "lte", unit: "°C", value: "", time: "", status: "pending" },
  { id: "h3", zone: "Bain-marie · warmhoud", target: "≥ 63 °C", limit: 63, cmp: "gte", unit: "°C", value: "", time: "", status: "pending" },
  { id: "h4", zone: "Ontvangst levering", target: "≤ 7 °C", limit: 7, cmp: "lte", unit: "°C", value: "", time: "", status: "pending" },
];

const SAMPLE_INVOICE =
  "GROOTHANDEL SLIGRO B.V. — Factuur 2026-04412\nDatum 14-05-2026  Klant: Bistro+ Den Bosch\n" +
  "------------------------------------------------\nArtikel                 Aantal   Prijs    Totaal\n" +
  "Zalmfilet vers           4,2 kg   29,40    123,48\nRoomboter ongezouten     2,0 kg   11,20     22,40\n" +
  "Sushirijst koshihikari    8,0 kg    3,95     31,60\nSesamzaad geroosterd      0,5 kg   11,30      5,65\n" +
  "Mirin Hon                 2,0 L     9,80     19,60\n------------------------------------------------\nTotaal incl. BTW                           220,98";

const NAV = [
  { section: "Creatie", items: [
    { id: "chef", label: "AI Sous-Chef", icon: ChefHat }, { id: "lab", label: "Recipe Lab", icon: FlaskConical }, { id: "flavor", label: "Flavor Matcher", icon: Sparkles },
  ]},
  { section: "Operatie", items: [
    { id: "supplier", label: "Supplier Portal", icon: RadioTower }, { id: "ingredients", label: "Ingrediënten", icon: Boxes }, { id: "ocr", label: "Factuur Scan", icon: ScanLine }, { id: "haccp", label: "HACCP-light", icon: ClipboardCheck },
  ]},
  { section: "Inzicht", items: [
    { id: "library", label: "Recipe Library", icon: LayoutGrid }, { id: "matrix", label: "Menu Matrix", icon: Grid2x2 },
  ]},
];
const FLAT_NAV = NAV.flatMap((g) => g.items);
const TITLES = {
  chef: "Chef de Cuisine", lab: "R&D Recipe Lab", flavor: "Moleculaire Smaakanalyse", supplier: "Leveranciers in realtime",
  ocr: "Factuurverwerking (OCR)", haccp: "Voedselveiligheid", library: "Actieve Menukaart", matrix: "Menu-engineering", ingredients: "Ingrediëntencatalogus",
};

/* --------------------------- Tool definitions ---------------------------- */
const ING_SCHEMA = { type: "array", items: { type: "object", properties: { name: { type: "string" }, g: { type: "number" }, unit: { type: "string" }, p: { type: "number" } } } };
const TOOLS = [
  { name: "save_recipe_version", description: "Sla een nieuwe receptversie op in het versiebeheer en open deze in de Recipe Lab. g = gram per couvert, p = inkoopprijs per kg/L.",
    input_schema: { type: "object", properties: { label: { type: "string" }, name: { type: "string" }, dish: { type: "string", description: "Gerechtnaam" }, note: { type: "string" }, menuPrice: { type: "number" }, prepTime: { type: "number" }, ingredients: ING_SCHEMA, prep: { type: "array", items: { type: "string" } } }, required: ["name"] } },
  { name: "update_recipe_version", description: "Pas een bestaande receptversie aan. Geef alleen de velden mee die wijzigen.",
    input_schema: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, dish: { type: "string" }, note: { type: "string" }, menuPrice: { type: "number" }, prepTime: { type: "number" }, ingredients: ING_SCHEMA, prep: { type: "array", items: { type: "string" } } }, required: ["id"] } },
  { name: "prepare_haccp", description: "Zet een HACCP-dagstaat klaar (zonder entries = standaard dagstaat).",
    input_schema: { type: "object", properties: { entries: { type: "array", items: { type: "object", properties: { zone: { type: "string" }, target: { type: "string" }, limit: { type: "number" }, cmp: { type: "string", enum: ["lte", "gte"] }, unit: { type: "string" } } } } } } },
  { name: "fill_haccp", description: "Vul gemeten waardes in op de HACCP-dagstaat; match op zone-naam.",
    input_schema: { type: "object", properties: { values: { type: "array", items: { type: "object", properties: { zone: { type: "string" }, value: { type: "string" }, time: { type: "string" } } } } }, required: ["values"] } },
  { name: "switch_supplier", description: "Wissel de leverancier van een ingrediënt naar een goedkoper alternatief.",
    input_schema: { type: "object", properties: { ingredient: { type: "string" } }, required: ["ingredient"] } },
  { name: "navigate_app", description: "Navigeer naar een module van de app.",
    input_schema: { type: "object", properties: { tab: { type: "string", enum: ["chef", "lab", "flavor", "supplier", "ingredients", "ocr", "haccp", "library", "matrix"] } }, required: ["tab"] } },
  { name: "search_ingredients", description: "Doorzoek de Hanos/Sligro-catalogus op concrete artikelen, eenheden en prijzen. Gebruik dit vóór je een gerecht voorstelt of een receptuur opslaat, zodat je met echte prijzen rekent.",
    input_schema: { type: "object", properties: { query: { type: "string" }, category: { type: "string" }, supplier: { type: "string", enum: ["Hanos", "Sligro", "Beide"] }, max: { type: "number" } }, required: ["query"] } },
];

/* ------------------------------ Plate art -------------------------------- */
function Plate({ palette, size = 120, glaze = false }) {
  const [a, b] = palette;
  const id = useMemo(() => "g" + Math.random().toString(36).slice(2, 8), []);
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label="Gerecht">
      <defs><radialGradient id={id} cx="42%" cy="38%" r="70%"><stop offset="0%" stopColor={b} /><stop offset="100%" stopColor={a} /></radialGradient></defs>
      <circle cx="60" cy="60" r="56" fill="#FBFAF6" stroke={C.line} strokeWidth="1.5" />
      <circle cx="60" cy="60" r="44" fill="none" stroke={C.line} strokeWidth="1" opacity="0.7" />
      <path d="M34 62 q10 -22 32 -18 q20 4 20 20 q0 14 -22 16 q-26 2 -30 -18 z" fill={`url(#${id})`} />
      <path d="M40 60 q8 -10 20 -8" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      {glaze && <circle cx="76" cy="50" r="3" fill={C.gold} opacity="0.9" />}
      <circle cx="48" cy="72" r="2" fill="#FFFFFF" opacity="0.7" />
      <path d="M70 74 q6 -3 12 -1" stroke={C.green} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.8" />
    </svg>
  );
}

/* ================================ App ===================================== */
export default function SousPlusApp() {
  const [tab, setTab] = useState("chef");
  const [prices, setPrices] = useState({ ...BASE_PRICES });
  const [meta, setMeta] = useState(SUPPLIER_META);
  const [versions, setVersions] = useState(SEED_VERSIONS);
  const [activeVersion, setActiveVersion] = useState("v1.2");
  const [covers, setCovers] = useState(12);
  const [kitchenView, setKitchenView] = useState(false);
  const [menuPriceOverride, setMenuPriceOverride] = useState(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [alert, setAlert] = useState({ active: false, resolved: false, resolution: null });
  const [syncing, setSyncing] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [flash, setFlash] = useState({});
  const [query, setQuery] = useState("Salmon");
  const [activeFilters, setActiveFilters] = useState([]);
  const [libCat, setLibCat] = useState("All");
  const [favs, setFavs] = useState(LIBRARY.reduce((o, r) => ((o[r.id] = r.fav), o), {}));
  const [haccp, setHaccp] = useState(INITIAL_HACCP);
  const [auditLog, setAuditLog] = useState([]);
  const [storageState, setStorageState] = useState("loading");
  const bellRef = useRef(null);

  useEffect(() => {
    function onDoc(e) { if (bellRef.current && !bellRef.current.contains(e.target)) setBellOpen(false); }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Load persisted HACCP on mount
  useEffect(() => {
    (async () => {
      if (!STORAGE_OK) { setStorageState("off"); return; }
      try {
        let cur = null;
        try { const r = await window.storage.get("haccp:current"); if (r && r.value) cur = JSON.parse(r.value); } catch (e) {}
        if (cur && Array.isArray(cur.rows) && cur.date === dateStr()) setHaccp(cur.rows);
        let log = [];
        try { const r = await window.storage.get("haccp:log"); if (r && r.value) log = JSON.parse(r.value); } catch (e) {}
        setAuditLog(log); setStorageState("on");
      } catch (e) { setStorageState("off"); }
    })();
  }, []);

  async function persistCurrent(rows) {
    if (!STORAGE_OK) return;
    try { await window.storage.set("haccp:current", JSON.stringify({ date: dateStr(), rows })); } catch (e) {}
  }
  async function appendAudit(rec) {
    if (!STORAGE_OK) { setAuditLog((l) => [...l, rec]); return; }
    try {
      let log = [];
      try { const r = await window.storage.get("haccp:log"); if (r && r.value) log = JSON.parse(r.value); } catch (e) {}
      log.push(rec); if (log.length > 500) log = log.slice(-500);
      await window.storage.set("haccp:log", JSON.stringify(log)); setAuditLog(log);
    } catch (e) {}
  }

  const version = versions.find((v) => v.id === activeVersion) || versions[0];
  const priceOf = (ing) => (prices[ing.id] != null ? prices[ing.id] : ing.p);
  const perCoverCost = (i) => (i.mode === "piece" ? i.g * priceOf(i) : (i.g / 1000) * priceOf(i));
  const fcOf = (v) => v.ingredients.reduce((s, i) => s + perCoverCost(i), 0);
  const menuPriceOf = (v) => (v.id === "v1.2" && menuPriceOverride != null ? menuPriceOverride : v.menuPrice);
  const marginOf = (v) => { const mp = menuPriceOf(v); return ((mp - fcOf(v)) / mp) * 100; };

  const fcPerCover = useMemo(() => fcOf(version), [version, prices]);
  const menuPrice = menuPriceOf(version);
  const margin = marginOf(version);
  const marginCritical = margin < 70;
  const alertOpen = alert.active && !alert.resolved;
  const liveSalmonMargin = useMemo(() => { const v = versions.find((x) => x.id === "v1.2"); return v ? marginOf(v) : 0; }, [versions, prices, menuPriceOverride]);

  function reSync() {
    if (syncing) return;
    setSyncing(true); setBellOpen(false);
    setTimeout(() => {
      setPrices((prev) => {
        const next = { ...prev }; const flashes = {};
        Object.keys(next).forEach((k) => {
          if (k === "butter" && syncCount === 0) { next.butter = +(BASE_PRICES.butter * 1.14).toFixed(2); flashes.butter = "up"; }
          else { const d = Math.random() * 0.06 - 0.03; const nv = +(next[k] * (1 + d)).toFixed(2); flashes[k] = nv >= next[k] ? "up" : "down"; next[k] = nv; }
        });
        setFlash(flashes); return next;
      });
      if (syncCount === 0) setAlert({ active: true, resolved: false, resolution: null });
      setSyncCount((c) => c + 1); setSyncing(false);
      setTimeout(() => setFlash({}), 1400);
    }, 1400);
  }
  function acceptHike() { setMenuPriceOverride(23.3); setAlert((a) => ({ ...a, resolved: true, resolution: "accepted" })); }
  function switchSupplier() {
    setPrices((p) => ({ ...p, butter: 8.4 }));
    setMeta((m) => ({ ...m, butter: { ...m.butter, supplier: "Leverancier Y · Eurial" } }));
    setFlash((f) => ({ ...f, butter: "down" })); setTimeout(() => setFlash({}), 1400);
    setAlert((a) => ({ ...a, resolved: true, resolution: "switched" }));
  }
  function dismissAlert() { setAlert({ active: false, resolved: false, resolution: null }); setBellOpen(false); }

  function evalStatus(entry, val) {
    const num = parseFloat(String(val).replace(",", "."));
    if (val === "" || isNaN(num)) return "pending";
    return entry.cmp === "lte" ? (num <= entry.limit ? "ok" : "attention") : (num >= entry.limit ? "ok" : "attention");
  }
  function setHaccpValue(id, val) {
    setHaccp((prev) => {
      const rows = prev.map((r) => r.id === id ? { ...r, value: val, time: val === "" ? "" : nowTime(), status: evalStatus(r, val) } : r);
      const changed = rows.find((r) => r.id === id);
      persistCurrent(rows);
      if (val !== "" && !isNaN(parseFloat(String(val).replace(",", ".")))) appendAudit({ date: dateStr(), time: changed.time, zone: changed.zone, target: changed.target, value: val + " " + changed.unit, status: changed.status, by: "M. de Vries" });
      return rows;
    });
  }
  function resetHaccp() { const rows = INITIAL_HACCP.map((r) => ({ ...r, value: "", time: "", status: "pending" })); setHaccp(rows); persistCurrent(rows); }

  function buildContext() {
    return {
      covers, activeRecipe: version.id,
      recipes: versions.map((v) => ({ id: v.id, name: v.name, dish: v.dish, menuPrice: +menuPriceOf(v).toFixed(2), prepTimeMin: v.prepTime, foodcostPerCover: +fcOf(v).toFixed(2), marginPct: +marginOf(v).toFixed(1), ingredients: v.ingredients.map((i) => ({ name: i.name, perCover: i.g + i.unit, pricePerKg: priceOf(i) })), steps: v.prep })),
      livePrices: Object.keys(meta).map((k) => ({ id: k, name: meta[k].name, supplier: meta[k].supplier, price: prices[k], unit: meta[k].unit })),
      flavorPairings: FLAVOR_DB,
      ingredientCatalog: { totalArticles: INGREDIENTS.length, categories: ING_CATS.filter((c) => c !== "Alle"), suppliers: ["Hanos", "Sligro"], note: "Doorzoekbare catalogus in module 'ingredients'." },
      menu: LIBRARY.map((r) => ({ name: r.name, category: r.cat, price: r.price, marginPct: r.id === "salmon" ? +liveSalmonMargin.toFixed(1) : r.margin, coversPerMonth: r.pop })),
      haccp: haccp.map((h) => ({ zone: h.zone, target: h.target, value: h.value || null, status: h.status })),
      marginAlert: alert.active && !alert.resolved ? "Roomboter +14% — Miso Salmon onder 70%" : "geen",
    };
  }

  function executeAction(action) {
    if (!action || typeof action !== "object") return null;
    const t = action.type; const p = action.payload || {};
    try {
      if ((t === "navigate" || t === "navigate_app") && p.tab && TITLES[p.tab]) { setTab(p.tab); return { msg: "Geopend: " + TITLES[p.tab], goto: p.tab }; }
      if (t === "switch_supplier") { switchSupplier(); return { msg: "Leverancier voor roomboter gewisseld — marge beschermd.", goto: "supplier" }; }
      if (t === "fill_haccp" && Array.isArray(p.values)) {
        let n = 0;
        const rows = haccp.map((r) => {
          const hit = p.values.find((v) => v.zone && r.zone.toLowerCase().includes(String(v.zone).toLowerCase()));
          if (hit && hit.value != null) { n++; const val = String(hit.value); const time = hit.time || nowTime(); const status = evalStatus(r, val); appendAudit({ date: dateStr(), time, zone: r.zone, target: r.target, value: val + " " + r.unit, status, by: "Chef Auguste" }); return { ...r, value: val, time, status }; }
          return r;
        });
        setHaccp(rows); persistCurrent(rows);
        return { msg: n + " HACCP-registratie(s) ingevuld, gecontroleerd en vastgelegd.", goto: "haccp" };
      }
      if (t === "prepare_haccp") {
        const rows = (Array.isArray(p.entries) && p.entries.length)
          ? p.entries.map((e, i) => ({ id: "ha" + Date.now() + i, zone: e.zone || "Registratie", target: e.target || "", limit: Number(e.limit) || 0, cmp: e.cmp === "gte" ? "gte" : "lte", unit: e.unit || "°C", value: "", time: "", status: "pending" }))
          : INITIAL_HACCP.map((r) => ({ ...r, value: "", time: "", status: "pending" }));
        setHaccp(rows); persistCurrent(rows);
        return { msg: "HACCP-dagstaat klaargezet — klaar om af te tekenen.", goto: "haccp" };
      }
      if (t === "update_recipe_version" && p.id) {
        setVersions((vs) => vs.map((v) => {
          if (v.id !== p.id) return v;
          const nv = { ...v };
          if (p.dish) nv.dish = p.dish; if (p.name) nv.name = p.name; if (p.note) nv.note = p.note;
          if (p.menuPrice != null) nv.menuPrice = Number(p.menuPrice); if (p.prepTime != null) nv.prepTime = Number(p.prepTime);
          if (Array.isArray(p.prep)) nv.prep = p.prep; if (Array.isArray(p.ingredients)) nv.ingredients = normalizeIngredients(p.ingredients);
          return nv;
        }));
        return { msg: "Receptuur " + p.id + " bijgewerkt.", goto: "lab" };
      }
      if (t === "save_recipe_version") {
        const label = p.label || ("v1." + versions.length);
        const id = versions.some((v) => v.id === label) ? label + "-" + (Date.now() % 1000) : label;
        const ref = versions.find((v) => v.id === "v1.2") || versions[0];
        const nv = {
          id, label, name: p.name || "Nieuwe variant", date: nowTime(), dish: p.dish || ref.dish || "Miso-Glazed Salmon",
          prepTime: p.prepTime != null ? Number(p.prepTime) : ref.prepTime, menuPrice: p.menuPrice != null ? Number(p.menuPrice) : ref.menuPrice,
          note: p.note || "Opgesteld door Chef Auguste.",
          ingredients: Array.isArray(p.ingredients) && p.ingredients.length ? normalizeIngredients(p.ingredients) : ref.ingredients.map((i) => ({ ...i })),
          prep: Array.isArray(p.prep) && p.prep.length ? p.prep : ref.prep.slice(),
        };
        setVersions((vs) => [...vs, nv]); setActiveVersion(id);
        return { msg: "Receptuur opgeslagen als " + label + " — geopend in Recipe Lab.", goto: "lab" };
      }
    } catch (e) { return { msg: "Actie kon niet volledig worden uitgevoerd." }; }
    return null;
  }

  return (
    <div style={{ fontFamily: sans, background: C.canvas, color: C.charcoal, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        ::selection { background: ${C.champagne}; color: ${C.charcoal}; }
        @keyframes sp-fade { from { opacity: 0; transform: translateY(8px);} to { opacity: 1; transform: none; } }
        @keyframes sp-bar { from { width: 0; } }
        @keyframes sp-pulse { 0%,100% { opacity: 1;} 50% { opacity: .35; } }
        @keyframes sp-spin { to { transform: rotate(360deg); } }
        @keyframes sp-pop { 0% { transform: scale(1);} 30% { transform: scale(1.08);} 100% { transform: scale(1);} }
        @keyframes sp-dot { 0%,80%,100% { opacity:.25; } 40% { opacity:1; } }
        @keyframes sp-scan { 0% { top: 0; } 100% { top: 100%; } }
        .sp-spin { animation: sp-spin .9s linear infinite; }
        .sp-card { transition: box-shadow .25s ease, transform .25s ease, border-color .2s ease; }
        .sp-card:hover { box-shadow: 0 12px 30px rgba(21,39,28,.10); transform: translateY(-3px); }
        .sp-nav, .sp-btn, .sp-tab { transition: background .18s ease, color .18s ease, border-color .18s ease, transform .1s ease; }
        .sp-btn:active { transform: scale(.97); }
        .sp-input:focus { outline: none; box-shadow: 0 0 0 3px ${C.champagne}; border-color: ${C.gold} !important; }
        .sp-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .sp-scroll::-webkit-scrollbar-thumb { background: ${C.line}; border-radius: 8px; }
        .sp-topnav { display: none; }
        .sp-tablewrap { overflow-x: auto; }
        @media (max-width: 980px) {
          .sp-sidebar { display: none !important; }
          .sp-topnav { display: flex !important; }
          .sp-main { padding: 18px 16px 60px !important; }
          .sp-lab2 { grid-template-columns: 1fr !important; }
          .sp-stats4 { grid-template-columns: repeat(2,1fr) !important; }
          .sp-ocr2 { grid-template-columns: 1fr !important; }
          .sp-hd-sub { display: none; }
          .sp-hd { padding: 0 16px !important; }
        }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {/* Sidebar (wide) */}
        <aside className="sp-sidebar" style={{ width: 256, flexShrink: 0, background: C.forest, color: "#E6EAE3", display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh" }}>
          <div style={{ padding: "26px 24px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: C.champagne, display: "grid", placeItems: "center", color: C.forest, flexShrink: 0 }}><Utensils size={19} /></div>
              <div><div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, lineHeight: 1 }}>SousPlus<span style={{ color: C.gold }}>+</span></div><div style={{ fontSize: 10.5, letterSpacing: "0.18em", color: "#9DB0A2", marginTop: 3, textTransform: "uppercase" }}>Kitchen Studio</div></div>
            </div>
            <div style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: "rgba(240,230,210,0.08)", border: `1px solid ${C.forestLine}`, color: C.champagne, fontSize: 11, fontWeight: 600 }}><Crown size={13} /> PREMIUM</div>
          </div>
          <nav className="sp-scroll" style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 16, flex: 1, overflowY: "auto" }}>
            {NAV.map((grp) => (
              <div key={grp.section}>
                <div style={{ fontSize: 10, letterSpacing: "0.16em", color: "#7E9085", textTransform: "uppercase", padding: "0 12px 8px", fontWeight: 600 }}>{grp.section}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {grp.items.map((n) => { const Icon = n.icon; const on = tab === n.id; return (
                    <button key={n.id} className="sp-nav sp-btn" onClick={() => setTab(n.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "left", width: "100%", fontSize: 13.5, fontWeight: on ? 600 : 500, background: on ? C.champagne : "transparent", color: on ? C.forest : "#C2CEC6" }}>
                      <Icon size={17} style={{ flexShrink: 0 }} />{n.label}
                      {n.id === "chef" && !on && <span style={{ marginLeft: "auto", fontSize: 9, letterSpacing: "0.05em", color: C.gold, border: `1px solid ${C.forestLine}`, padding: "1px 6px", borderRadius: 999 }}>AI</span>}
                      {on && <ArrowRight size={14} style={{ marginLeft: "auto" }} />}
                    </button>
                  ); })}
                </div>
              </div>
            ))}
          </nav>
          <div style={{ padding: 16, borderTop: `1px solid ${C.forestLine}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", flexShrink: 0, background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`, display: "grid", placeItems: "center", color: "#FFF", fontWeight: 600 }}>M</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>Mark de Vries</div><div style={{ fontSize: 11.5, color: "#9DB0A2" }}>Executive Chef · Bistro+</div></div>
              <Settings size={17} style={{ color: "#9DB0A2", cursor: "pointer" }} />
            </div>
          </div>
        </aside>

        {/* Main */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          <header className="sp-hd" style={{ minHeight: 70, borderBottom: `1px solid ${C.line}`, background: "rgba(244,242,236,0.85)", backdropFilter: "blur(8px)", position: "sticky", top: 0, zIndex: 30, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 32px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: C.forest, display: "grid", placeItems: "center", color: C.champagne }}><Utensils size={16} /></div>
              <div className="sp-hd-sub"><div style={{ fontSize: 11, letterSpacing: "0.16em", color: C.muted, textTransform: "uppercase" }}>{TITLES[tab]}</div><div style={{ fontFamily: serif, fontSize: 19, fontWeight: 600, marginTop: 1 }}>{FLAT_NAV.find((n) => n.id === tab)?.label}</div></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: C.green, background: C.greenSoft, padding: "6px 12px", borderRadius: 999, fontWeight: 600 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.green }} /> API Live</div>
              <div ref={bellRef} style={{ position: "relative" }}>
                <button className="sp-btn" aria-label="Meldingen" onClick={() => setBellOpen((o) => !o)} style={{ position: "relative", width: 42, height: 42, borderRadius: 12, cursor: "pointer", border: `1px solid ${C.line}`, background: C.card, display: "grid", placeItems: "center", color: C.charcoal }}>
                  <Bell size={19} />{alertOpen && <span style={{ position: "absolute", top: 8, right: 9, width: 9, height: 9, borderRadius: "50%", background: C.red, border: "2px solid #FFF", animation: "sp-pulse 1.6s infinite" }} />}
                </button>
                {bellOpen && <NotificationPanel alert={alert} liveSalmonMargin={liveSalmonMargin} onClose={() => setBellOpen(false)} onSwitch={switchSupplier} onAccept={acceptHike} onDismiss={dismissAlert} />}
              </div>
            </div>
          </header>

          {/* Top nav (narrow) */}
          <div className="sp-topnav sp-scroll" style={{ position: "sticky", top: 70, zIndex: 25, background: C.forest, gap: 4, padding: "8px 12px", overflowX: "auto", borderBottom: `1px solid ${C.forestLine}` }}>
            {FLAT_NAV.map((n) => { const Icon = n.icon; const on = tab === n.id; return (
              <button key={n.id} className="sp-btn" onClick={() => setTab(n.id)} style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 7, padding: "9px 13px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: on ? 600 : 500, background: on ? C.champagne : "transparent", color: on ? C.forest : "#C2CEC6" }}><Icon size={16} />{n.label}</button>
            ); })}
          </div>

          <main className="sp-main sp-scroll" style={{ flex: 1, overflowY: "auto", padding: 32 }}>
            <div key={tab} style={{ animation: "sp-fade .3s ease", maxWidth: tab === "chef" ? 900 : 1180, margin: "0 auto" }}>
              {tab === "chef" && <SousChef buildContext={buildContext} executeAction={executeAction} goTo={setTab} />}
              {tab === "lab" && <RecipeLab {...{ versions, version, setVersions, setActiveVersion, activeVersion, covers, setCovers, kitchenView, setKitchenView, fcPerCover, menuPrice, margin, marginCritical, priceOf }} />}
              {tab === "flavor" && <FlavorMatcher {...{ query, setQuery, activeFilters, setActiveFilters }} />}
              {tab === "supplier" && <SupplierPortal {...{ prices, meta, syncing, reSync, flash }} />}
              {tab === "ingredients" && <IngredientsCatalog />}
              {tab === "ocr" && <OcrScan {...{ setPrices }} />}
              {tab === "haccp" && <Haccp {...{ haccp, setHaccpValue, resetHaccp, auditLog, storageState }} />}
              {tab === "library" && <RecipeLibrary {...{ libCat, setLibCat, favs, setFavs, liveSalmonMargin, goTo: setTab, setActiveVersion }} />}
              {tab === "matrix" && <MenuMatrix liveSalmonMargin={liveSalmonMargin} goTo={setTab} setActiveVersion={setActiveVersion} />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function normalizeIngredients(arr) {
  return arr.map((i, k) => ({ id: i.id || ("ing" + k + "-" + Date.now()), name: i.name || "Ingrediënt", g: Number(i.g != null ? i.g : (i.grams != null ? i.grams : 0)) || 0, unit: i.unit || "g", p: Number(i.p != null ? i.p : (i.pricePerKg != null ? i.pricePerKg : (i.price != null ? i.price : 0))) || 0, mode: i.mode === "piece" ? "piece" : "weight" }));
}

/* ------------------------- Notification panel ---------------------------- */
function NotificationPanel({ alert, liveSalmonMargin, onClose, onSwitch, onAccept, onDismiss }) {
  return (
    <div style={{ position: "absolute", right: 0, top: 50, width: 360, maxWidth: "92vw", background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: "0 18px 48px rgba(21,39,28,.18)", overflow: "hidden", animation: "sp-fade .2s ease", zIndex: 40 }}>
      <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ fontWeight: 600, fontSize: 14 }}>Marge-Waakhond</div><button onClick={onClose} className="sp-btn" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={16} /></button></div>
      {!alert.active && <div style={{ padding: "26px 20px", textAlign: "center", color: C.muted, fontSize: 13 }}>Geen actieve waarschuwingen. Alle marges binnen norm.<div style={{ marginTop: 6, fontSize: 12 }}>Tip: draai een Re-Sync in het Supplier Portal.</div></div>}
      {alert.active && !alert.resolved && (
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><TrendingUp size={16} style={{ color: C.red }} /><span style={{ fontWeight: 700, color: C.red, fontSize: 14 }}>Roomboter +14% bij Leverancier X</span></div>
          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, marginBottom: 6 }}>De marge op <strong>Miso Salmon</strong> daalt tot <strong style={{ color: C.red }}>{pct(liveSalmonMargin)}</strong> — onder de kritieke grens van 70%.</div>
          <div style={{ fontSize: 12, color: C.muted, background: C.canvas, borderRadius: 10, padding: "8px 10px", marginBottom: 14 }}>Foodcost-impact: +{eur(0.082)} per couvert.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="sp-btn" onClick={onSwitch} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: `1px solid ${C.forest}`, background: C.forest, color: "#FFF", fontSize: 12.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><ArrowLeftRight size={14} /> Wissel leverancier</button>
            <button className="sp-btn" onClick={onAccept} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, cursor: "pointer", border: `1px solid ${C.gold}`, background: C.champagneSoft, color: C.goldDeep, fontSize: 12.5, fontWeight: 600 }}>Prijs accepteren</button>
          </div>
        </div>
      )}
      {alert.active && alert.resolved && (
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: C.greenSoft, display: "grid", placeItems: "center" }}><Check size={14} style={{ color: C.green }} /></div><span style={{ fontWeight: 700, color: C.green, fontSize: 14 }}>Marge beschermd</span></div>
          <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, marginBottom: 14 }}>{alert.resolution === "switched" ? "Overgestapt naar Leverancier Y · Eurial. Marge hersteld naar " + pct(liveSalmonMargin) + "." : "Menuprijs bijgesteld naar " + eur(23.3) + ". Marge hersteld naar " + pct(liveSalmonMargin) + "."}</div>
          <button className="sp-btn" onClick={onDismiss} style={{ width: "100%", padding: "9px 12px", borderRadius: 10, cursor: "pointer", border: `1px solid ${C.line}`, background: C.card, color: C.ink, fontSize: 12.5, fontWeight: 600 }}>Sluiten</button>
        </div>
      )}
    </div>
  );
}

/* ============================ AI SOUS-CHEF ================================ */
const CHEF_TASKS = [
  "Analyseer de marge van het voorjaarsmenu en wijs het zwakste gerecht aan.",
  "Stel een nieuw bietenvoorgerecht voor met echte inkoopprijzen uit de catalogus en sla het op.",
  "Zet de HACCP-dagstaat voor vandaag klaar.",
  "Welke pairing tilt de zalm naar een hoger niveau? Onderbouw het.",
];

function SousChef({ buildContext, executeAction, goTo }) {
  const [entries, setEntries] = useState([
    { role: "chef", q: null, prose: "Chef. De brigade staat klaar. Ik heb zicht op je recepturen, de live inkoopprijzen, de pairings en de HACCP-staat. Zeg het maar — een analyse, een receptuur fijnslijpen, of de dagstaat klaarzetten. Ik voer het uit.", result: null },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [entries, busy]);

  function buildSystem() {
    return (
      "Je bent Chef Auguste, de digitale sous-chef de cuisine binnen SousPlus+, een premium platform voor professionele keukens. " +
      "Je spreekt Nederlands. Je bent GEEN chatbot: je spreekt als een doorgewinterde brigade-souschef op Michelin-niveau — beslist, precies, warm maar met gezag, met natuurlijk gebruik van culinair-Franse vaktermen. " +
      "Houd je proza kort, als een mondelinge briefing aan de pas (meestal 2 tot 5 zinnen; alleen langer bij een echte analyse). Geen bullets tenzij echt nodig. " +
      "Baseer alles op de meegeleverde APP-CONTEXT (echte recepturen, prijzen, marges, pairings, HACCP). Citeer concrete getallen waar relevant; verzin geen cijfers die niet kloppen met de context. " +
      "Gebruik de beschikbare tools om acties echt uit te voeren wanneer de chef daarom vraagt (recept opslaan of aanpassen, HACCP klaarzetten of invullen, leverancier wisselen, navigeren). Beschrijf kort in je proza wat je doet; de tool voert het uit. Voer geen actie uit als er alleen om advies of analyse wordt gevraagd. " +
      "Wanneer een vraag of opdracht over concrete ingrediënten, prijzen of een nieuwe receptuur gaat, gebruik je EERST search_ingredients om echte artikelen en prijzen uit de Hanos/Sligro-catalogus op te halen, en pas daarna reken of stel je voor — verzin geen prijzen. Sla een recept dat je voorstelt ook echt op met save_recipe_version, met de gevonden prijzen als p (prijs per kg/L) en de hoeveelheid als g (gram per couvert). " +
      "APP-CONTEXT (JSON):\n" + JSON.stringify(buildContext())
    );
  }

  async function callAPI(messages, noTools) {
    const body = { model: "claude-sonnet-4-6", max_tokens: 1500, system: buildSystem(), messages, tools: TOOLS };
    if (noTools) body.tool_choice = { type: "none" };
    const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return res.json();
  }

  function runTool(name, input) {
    if (name === "search_ingredients") {
      const t = String(input.query || "").toLowerCase();
      let res = INGREDIENTS.filter((i) =>
        (t === "" || i.name.toLowerCase().includes(t) || i.cat.toLowerCase().includes(t)) &&
        (!input.category || i.cat.toLowerCase().includes(String(input.category).toLowerCase())) &&
        (!input.supplier || i.supplier === input.supplier || i.supplier === "Beide"));
      const n = Math.min(Math.max(Number(input.max) || 12, 1), 25);
      res = res.slice(0, n).map((i) => ({ name: i.name, cat: i.cat, supplier: i.supplier, unit: i.unit, price: i.price }));
      return { toolText: JSON.stringify({ count: res.length, items: res }), chip: null };
    }
    const r = executeAction({ type: name, payload: input || {} });
    return { toolText: r ? r.msg : "Uitgevoerd.", chip: r };
  }

  async function send(text) {
    const q = (text != null ? text : input).trim();
    if (!q || busy) return;
    setInput(""); setBusy(true);
    const history = entries.filter((e) => e.role === "chef" && e.q && e.prose).flatMap((e) => ([{ role: "user", content: e.q }, { role: "assistant", content: e.prose }]));
    setEntries((es) => [...es, { role: "you", q }]);
    try {
      let msgs = [...history, { role: "user", content: q }];
      let prose = ""; let chip = null; let guard = 0;
      while (guard < 5) {
        const noTools = guard >= 4;
        const data = await callAPI(msgs, noTools);
        const content = data.content || [];
        const txt = content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        if (txt) prose = txt;
        const tu = content.find((b) => b.type === "tool_use");
        if (!tu || noTools) break;
        const { toolText, chip: c } = runTool(tu.name, tu.input || {});
        if (c) chip = c;
        msgs = [...msgs, { role: "assistant", content }, { role: "user", content: [{ type: "tool_result", tool_use_id: tu.id, content: toolText }] }];
        if (tu.name === "navigate_app") { if (!prose) prose = c ? c.msg : "Geopend, chef."; break; }
        guard++;
      }
      if (!prose) prose = "Genoteerd, chef.";
      setEntries((es) => [...es, { role: "chef", q, prose, result: chip }]);
    } catch (err) {
      setEntries((es) => [...es, { role: "chef", q, prose: "De lijn met de keuken hapert even — geef me zo opnieuw de opdracht.", result: null }]);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 150px)", minHeight: 460 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, background: C.forest, color: "#E6EAE3", borderRadius: 18, padding: "16px 20px", marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${C.gold}, ${C.goldDeep})`, display: "grid", placeItems: "center", fontFamily: serif, fontSize: 23, fontWeight: 600, color: "#FFF", border: `2px solid ${C.champagne}` }}>A</div>
          <div style={{ position: "absolute", bottom: -2, right: -2, width: 22, height: 22, borderRadius: "50%", background: C.forest, display: "grid", placeItems: "center" }}><ChefHat size={13} style={{ color: C.champagne }} /></div>
        </div>
        <div style={{ flex: 1, minWidth: 180 }}><div style={{ fontFamily: serif, fontSize: 21, fontWeight: 600 }}>Chef Auguste</div><div style={{ fontSize: 12.5, color: "#9DB0A2" }}>Sous-Chef de Cuisine · Michelin-niveau · met toegang tot je hele keuken</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: C.champagne, border: `1px solid ${C.forestLine}`, padding: "5px 11px", borderRadius: 999 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: busy ? C.gold : "#6FBF8E", animation: busy ? "sp-pulse 1s infinite" : "none" }} />{busy ? "beraadt zich" : "aan de pas"}</div>
      </div>

      <div ref={logRef} className="sp-scroll" style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, paddingRight: 4 }}>
        {entries.map((e, i) => (
          <div key={i} style={{ animation: "sp-fade .3s ease" }}>
            {e.role === "you" && <div><div style={{ fontSize: 10.5, letterSpacing: "0.14em", color: C.muted, textTransform: "uppercase", marginBottom: 4 }}>Jouw opdracht</div><div style={{ fontSize: 15, color: C.charcoal, fontWeight: 500 }}>{e.q}</div></div>}
            {e.role === "chef" && (
              <div style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 14, padding: "16px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}><div style={{ width: 24, height: 24, borderRadius: "50%", background: C.forest, display: "grid", placeItems: "center" }}><ChefHat size={13} style={{ color: C.champagne }} /></div><span style={{ fontFamily: serif, fontSize: 14.5, fontWeight: 600 }}>Chef Auguste</span></div>
                <div style={{ fontSize: 15, lineHeight: 1.62, color: C.ink, whiteSpace: "pre-wrap" }}>{e.prose}</div>
                {e.result && <button onClick={() => e.result.goto && goTo(e.result.goto)} className="sp-btn" style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, border: `1px solid ${C.gold}`, background: C.champagneSoft, color: C.goldDeep, cursor: e.result.goto ? "pointer" : "default", fontSize: 13, fontWeight: 600 }}><CheckCircle2 size={15} /> {e.result.msg} {e.result.goto && <ArrowRight size={14} />}</button>}
              </div>
            )}
          </div>
        ))}
        {busy && <div style={{ background: C.card, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 14, padding: "16px 20px", display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 24, height: 24, borderRadius: "50%", background: C.forest, display: "grid", placeItems: "center" }}><ChefHat size={13} style={{ color: C.champagne }} /></div><span style={{ fontFamily: serif, fontStyle: "italic", color: C.muted, fontSize: 14.5 }}>Auguste beraadt zich</span><span style={{ display: "inline-flex", gap: 3 }}>{[0, 1, 2].map((d) => <span key={d} style={{ width: 5, height: 5, borderRadius: "50%", background: C.gold, animation: `sp-dot 1.2s ${d * 0.18}s infinite` }} />)}</span></div>}
      </div>

      {entries.length <= 1 && !busy && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0 4px" }}>
          {CHEF_TASKS.map((t) => <button key={t} className="sp-btn" onClick={() => send(t)} style={{ textAlign: "left", padding: "9px 13px", borderRadius: 11, border: `1px solid ${C.line}`, background: C.card, color: C.ink, cursor: "pointer", fontSize: 12.5, lineHeight: 1.35, maxWidth: 270 }}><Wand2 size={13} style={{ color: C.gold, marginRight: 6, verticalAlign: "-2px" }} />{t}</button>)}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
        <input className="sp-input" value={input} onChange={(ev) => setInput(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") send(); }} placeholder="Vraag het de chef, of geef een opdracht…" style={{ flex: 1, height: 52, padding: "0 18px", borderRadius: 14, border: `1px solid ${C.line}`, background: C.card, color: C.charcoal, fontFamily: sans, fontSize: 15 }} />
        <button className="sp-btn" onClick={() => send()} disabled={busy || !input.trim()} style={{ height: 52, padding: "0 20px", borderRadius: 14, border: "none", cursor: busy || !input.trim() ? "default" : "pointer", background: busy || !input.trim() ? C.forest2 : C.forest, color: "#FFF", fontSize: 14.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 9, opacity: busy || !input.trim() ? 0.6 : 1 }}>{busy ? <Loader2 size={18} className="sp-spin" /> : <Send size={17} />} Vraag advies</button>
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 8, textAlign: "center" }}>Chef Auguste draait op de Intelligent Router (Tier 2 · Claude) en voert acties uit via officiële tool-use — catalogus doorzoeken, recepturen opslaan/aanpassen, HACCP klaarzetten, leveranciers wisselen.</div>
    </div>
  );
}

/* ----------------------------- Recipe Lab -------------------------------- */
function StatChip({ label, value, accent }) {
  return (<div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 16px", minWidth: 0 }}><div style={{ fontSize: 11, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase" }}>{label}</div><div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, marginTop: 3, color: accent || C.charcoal }}>{value}</div></div>);
}
function RecipeLab(props) {
  const { versions, version, setVersions, setActiveVersion, activeVersion, covers, setCovers, kitchenView, setKitchenView, fcPerCover, margin, marginCritical, priceOf } = props;
  const [picker, setPicker] = useState(false);
  const [pq, setPq] = useState("");
  const perCover = (i) => (i.mode === "piece" ? i.g * priceOf(i) : (i.g / 1000) * priceOf(i));
  function updateIng(fn) { setVersions((vs) => vs.map((v) => (v.id === activeVersion ? { ...v, ingredients: fn(v.ingredients) } : v))); }
  function setAmount(id, val) { const n = parseFloat(String(val).replace(",", ".")); updateIng((ings) => ings.map((i) => (i.id === id ? { ...i, g: isNaN(n) ? 0 : n } : i))); }
  function removeIng(id) { updateIng((ings) => ings.filter((i) => i.id !== id)); }
  function addFromCatalog(item) {
    const weight = item.unit === "kg" || item.unit === "L";
    const ing = { id: item.id, name: item.name, g: weight ? 50 : 1, unit: weight ? (item.unit === "L" ? "ml" : "g") : item.unit, p: item.price, mode: weight ? "weight" : "piece" };
    updateIng((ings) => (ings.some((i) => i.id === item.id) ? ings : [...ings, ing]));
  }
  const pickResults = useMemo(() => { const t = pq.trim().toLowerCase(); return INGREDIENTS.filter((i) => t === "" || i.name.toLowerCase().includes(t) || i.cat.toLowerCase().includes(t)).slice(0, 40); }, [pq]);
  const presentIds = new Set(version.ingredients.map((i) => i.id));
  return (
    <div>
      <div className="sp-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 20, padding: 24, display: "flex", gap: 26, alignItems: "center", marginBottom: 22, flexWrap: "wrap" }}>
        <div style={{ flexShrink: 0, background: C.canvas, borderRadius: 18, padding: 12 }}><Plate palette={["#E9A06B", "#F2C9A0"]} size={132} glaze /></div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}><span style={{ fontSize: 11, letterSpacing: "0.14em", color: C.gold, textTransform: "uppercase", fontWeight: 600 }}>Signatuur · Seafood</span><span style={{ width: 4, height: 4, borderRadius: "50%", background: C.line }} /><span style={{ fontSize: 11, color: C.muted }}>{version.label} · {version.name}</span></div>
          <h1 style={{ fontFamily: serif, fontSize: 34, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>{version.dish || "Miso-Glazed Salmon"}</h1>
          <p style={{ color: C.ink, fontSize: 14, lineHeight: 1.6, margin: "10px 0 0", maxWidth: 560 }}>{version.note}</p>
        </div>
        <button className="sp-btn" onClick={() => setKitchenView((k) => !k)} style={{ flexShrink: 0, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${kitchenView ? C.forest : C.line}`, background: kitchenView ? C.forest : C.card, color: kitchenView ? "#FFF" : C.ink }}>{kitchenView ? <EyeOff size={16} /> : <Eye size={16} />} Kitchen View</button>
      </div>

      <div className="sp-stats4" style={{ display: "grid", gap: 14, marginBottom: 22, gridTemplateColumns: kitchenView ? "repeat(2, 1fr)" : "repeat(4, 1fr)" }}>
        <StatChip label="Prep tijd" value={version.prepTime + " min"} />
        {!kitchenView && <StatChip label="Foodcost p.c." value={eur(fcPerCover)} />}
        {!kitchenView && <StatChip label="Marge" value={pct(margin)} accent={marginCritical ? C.red : C.green} />}
        <StatChip label="Live status" value={kitchenView ? "Service" : "Synced"} accent={C.gold} />
      </div>

      {kitchenView && <div style={{ background: C.champagneSoft, border: `1px solid ${C.champagne}`, borderRadius: 12, padding: "10px 16px", fontSize: 12.5, color: C.goldDeep, marginBottom: 22, display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}><EyeOff size={15} /> Kitchen View actief — financiële data verborgen voor de pas.</div>}

      <div className="sp-lab2" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, alignItems: "start" }}>
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}><GitBranch size={16} style={{ color: C.gold }} /><span style={{ fontFamily: serif, fontSize: 16, fontWeight: 600 }}>Culinair Versiebeheer</span></div>
            <div className="sp-scroll" style={{ position: "relative", display: "flex", justifyContent: "space-between", padding: "0 6px", overflowX: "auto" }}>
              <div style={{ position: "absolute", left: 18, right: 18, top: 13, height: 2, background: C.line, zIndex: 0 }} />
              {versions.map((v) => { const on = v.id === activeVersion; return (
                <button key={v.id} className="sp-btn" onClick={() => setActiveVersion(v.id)} style={{ position: "relative", zIndex: 1, background: "transparent", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 9, flex: "1 0 auto", minWidth: 64 }}>
                  <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: on ? C.gold : C.card, border: `2px solid ${on ? C.gold : C.line}`, color: on ? "#FFF" : C.muted, boxShadow: on ? `0 0 0 5px ${C.champagneSoft}` : "none" }}>{on ? <Check size={14} /> : <span style={{ fontSize: 11, fontWeight: 600 }}>{v.label.replace("v", "")}</span>}</span>
                  <span style={{ fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? C.charcoal : C.muted }}>{v.label}</span><span style={{ fontSize: 11, color: C.muted }}>{v.name}</span>
                </button>
              ); })}
            </div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22 }}>
            <div style={{ fontFamily: serif, fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Bereidingswijze</div>
            <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 }}>{version.prep.map((step, i) => (<li key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}><span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: "50%", background: C.champagneSoft, color: C.goldDeep, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 12.5, fontFamily: serif }}>{i + 1}</span><span style={{ fontSize: 14.5, lineHeight: 1.55, color: C.ink, paddingTop: 2 }}>{step}</span></li>))}</ol>
          </div>
        </div>
        <div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22, marginBottom: 22 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", marginBottom: 12 }}>Couverts / Portionering</div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button className="sp-btn" onClick={() => setCovers((c) => Math.max(1, c - 1))} aria-label="Minder" style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: C.canvas, cursor: "pointer", display: "grid", placeItems: "center", color: C.charcoal }}><Minus size={18} /></button>
              <div style={{ flex: 1, textAlign: "center" }}><div style={{ fontFamily: serif, fontSize: 40, fontWeight: 600, lineHeight: 1 }}>{covers}</div><div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>covers vanavond</div></div>
              <button className="sp-btn" onClick={() => setCovers((c) => Math.min(200, c + 1))} aria-label="Meer" style={{ width: 42, height: 42, borderRadius: 12, border: `1px solid ${C.line}`, background: C.canvas, cursor: "pointer", display: "grid", placeItems: "center", color: C.charcoal }}><Plus size={18} /></button>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>{[10, 25, 50, 85].map((n) => <button key={n} className="sp-btn" onClick={() => setCovers(n)} style={{ flex: 1, padding: "7px 0", borderRadius: 9, cursor: "pointer", fontSize: 12, fontWeight: 600, border: `1px solid ${covers === n ? C.gold : C.line}`, background: covers === n ? C.champagneSoft : C.card, color: covers === n ? C.goldDeep : C.muted }}>{n}</button>)}</div>
          </div>
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}><span style={{ fontFamily: serif, fontSize: 16, fontWeight: 600 }}>Mise en place</span><span style={{ fontSize: 11.5, color: C.muted }}>per couvert</span></div>
            {version.ingredients.map((ing) => { const isPiece = ing.mode === "piece"; const lineCost = perCover(ing) * covers; const totalAmt = ing.g * covers; const totalDisp = isPiece ? "× " + (totalAmt % 1 === 0 ? totalAmt : totalAmt.toFixed(1).replace(".", ",")) + " " + ing.unit : (totalAmt >= 1000 ? (totalAmt / 1000).toFixed(2).replace(".", ",") + " kg" : Math.round(totalAmt) + " " + ing.unit); return (
              <div key={ing.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.canvas}`, gap: 8 }}>
                <span style={{ fontSize: 13.5, color: C.ink, flex: 1, minWidth: 0 }}>{ing.name}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  {!kitchenView && (<span style={{ display: "flex", alignItems: "center", gap: 4 }}><input className="sp-input" value={ing.g} onChange={(e) => setAmount(ing.id, e.target.value)} inputMode="decimal" aria-label={"hoeveelheid " + ing.name} style={{ width: 50, padding: "5px 7px", borderRadius: 8, border: `1px solid ${C.line}`, background: C.canvas, fontFamily: sans, fontSize: 13, color: C.charcoal, textAlign: "center" }} /><span style={{ fontSize: 11.5, color: C.muted, width: 24 }}>{ing.unit}</span></span>)}
                  {kitchenView && <span style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{totalDisp}</span>}
                  {!kitchenView && <span style={{ fontSize: 11, color: C.muted, width: 64, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totalDisp}</span>}
                  {!kitchenView && <span style={{ fontSize: 12.5, color: C.muted, width: 52, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(lineCost)}</span>}
                  {!kitchenView && <button className="sp-btn" onClick={() => removeIng(ing.id)} aria-label="Verwijder" style={{ width: 24, height: 24, borderRadius: 7, border: "none", background: "transparent", color: C.muted, cursor: "pointer", display: "grid", placeItems: "center" }}><X size={14} /></button>}
                </div>
              </div>
            ); })}
            {!kitchenView && <button className="sp-btn" onClick={() => { setPicker(true); setPq(""); }} style={{ width: "100%", marginTop: 14, padding: "10px 14px", borderRadius: 11, border: `1px dashed ${C.gold}`, background: C.champagneSoft, color: C.goldDeep, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><Plus size={16} /> Ingrediënt uit catalogus</button>}
            {!kitchenView && <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 13, color: C.muted }}>Totale inkoop voor {covers} covers</span><span style={{ fontFamily: serif, fontSize: 22, fontWeight: 600 }}>{eur(fcPerCover * covers)}</span></div>}
          </div>
        </div>
      </div>

      {picker && (
        <div onClick={() => setPicker(false)} style={{ position: "fixed", inset: 0, background: "rgba(14,26,18,0.45)", backdropFilter: "blur(2px)", display: "grid", placeItems: "center", zIndex: 60, padding: 16, animation: "sp-fade .2s ease" }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 540, maxWidth: "100%", maxHeight: "82vh", background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: "0 24px 60px rgba(21,39,28,.28)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}><div style={{ display: "flex", alignItems: "center", gap: 9 }}><Boxes size={17} style={{ color: C.gold }} /><span style={{ fontFamily: serif, fontSize: 16, fontWeight: 600 }}>Catalogus · {INGREDIENTS.length} artikelen</span></div><button className="sp-btn" onClick={() => setPicker(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: C.muted }}><X size={18} /></button></div>
            <div style={{ padding: 16, borderBottom: `1px solid ${C.line}` }}><div style={{ position: "relative" }}><PackageSearch size={17} style={{ position: "absolute", left: 13, top: 12, color: C.muted }} /><input autoFocus className="sp-input" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Zoek een ingrediënt of categorie…" style={{ width: "100%", padding: "11px 14px 11px 40px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.canvas, fontFamily: sans, fontSize: 14.5, color: C.charcoal }} /></div></div>
            <div className="sp-scroll" style={{ overflowY: "auto", padding: "6px 0" }}>
              {pickResults.map((it) => { const added = presentIds.has(it.id); const sc = SUP_COLOR[it.supplier] || SUP_COLOR.Beide; return (
                <button key={it.id} className="sp-btn" onClick={() => addFromCatalog(it)} disabled={added} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "11px 20px", border: "none", borderBottom: `1px solid ${C.canvas}`, background: "transparent", cursor: added ? "default" : "pointer", textAlign: "left" }}>
                  <span style={{ minWidth: 0 }}><span style={{ fontSize: 14, fontWeight: 600, color: C.charcoal, display: "block" }}>{it.name}</span><span style={{ fontSize: 11.5, color: C.muted }}>{it.cat} · <span style={{ color: sc.fg }}>{it.supplier}</span></span></span>
                  <span style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}><span style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{eur(it.price)}<span style={{ fontSize: 11, color: C.muted, fontWeight: 400 }}>/{it.unit}</span></span>{added ? <CheckCircle2 size={18} style={{ color: C.green }} /> : <Plus size={18} style={{ color: C.gold }} />}</span>
                </button>
              ); })}
              {pickResults.length === 0 && <div style={{ padding: "30px 20px", textAlign: "center", color: C.muted, fontSize: 14 }}>Geen artikelen gevonden.</div>}
            </div>
            <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}><span style={{ fontSize: 12, color: C.muted }}>Toegevoegde ingrediënten rekenen direct mee in de marge.</span><button className="sp-btn" onClick={() => setPicker(false)} style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: C.forest, color: "#FFF", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Klaar</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Flavor Matcher ----------------------------- */
function FlavorMatcher({ query, setQuery, activeFilters, setActiveFilters }) {
  const key = query.trim().toLowerCase();
  const base = FLAVOR_DB[key] || FLAVOR_DB.salmon;
  const usingFallback = !FLAVOR_DB[key];
  const results = base.filter((r) => (activeFilters.length === 0 ? true : activeFilters.every((f) => r.tags.includes(f))));
  const toggle = (t) => setActiveFilters((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 999, background: C.champagneSoft, border: `1px solid ${C.champagne}`, color: C.goldDeep, fontSize: 12, fontWeight: 600, marginBottom: 14 }}><Sparkles size={14} /> Curated culinary intelligence · Foodpairing®-ready (fase 2)</div>
      <p style={{ color: C.ink, fontSize: 14.5, lineHeight: 1.6, marginTop: 0, marginBottom: 22 }}>Onderbouw nieuwe gerechten met affinity-data in plaats van giswerk. De pilot draait op een gecureerde dataset uit voedselchemie en de kennis van onze ambassadeur-chefs; de live Foodpairing®-koppeling schakelt in na pilot-validatie.</p>
      <div style={{ position: "relative", marginBottom: 16 }}><Search size={18} style={{ position: "absolute", left: 16, top: 16, color: C.muted }} /><input className="sp-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Zoek een ingrediënt (Salmon, Tomato, Beef)…" style={{ width: "100%", padding: "14px 16px 14px 46px", borderRadius: 14, fontSize: 15, border: `1px solid ${C.line}`, background: C.card, color: C.charcoal, fontFamily: sans }} /></div>
      <div style={{ display: "flex", gap: 9, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}><span style={{ fontSize: 12, color: C.muted, marginRight: 4 }}>Smaakprofiel:</span>{FILTER_TAGS.map((t) => { const on = activeFilters.includes(t); return <button key={t} className="sp-btn" onClick={() => toggle(t)} style={{ padding: "7px 15px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 600, border: `1px solid ${on ? C.gold : C.line}`, background: on ? C.gold : C.card, color: on ? "#FFF" : C.ink }}>{t}</button>; })}{activeFilters.length > 0 && <button className="sp-btn" onClick={() => setActiveFilters([])} style={{ background: "transparent", border: "none", color: C.muted, cursor: "pointer", fontSize: 12.5, textDecoration: "underline" }}>wissen</button>}</div>
      <div style={{ fontSize: 12.5, color: C.muted, margin: "16px 0 12px" }}>{usingFallback && query.trim() !== "" ? `Geen dataset voor "${query}" — pairings voor Salmon getoond.` : `${results.length} matches voor ${query.trim() || "Salmon"}`}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{results.map((r) => (
        <div key={r.name} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "14px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 9 }}><div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}><span style={{ fontSize: 15, fontWeight: 600 }}>{r.name}</span><div style={{ display: "flex", gap: 5 }}>{r.tags.map((t) => <span key={t} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 999, background: C.canvas, color: C.muted, fontWeight: 600 }}>{t}</span>)}</div></div><span style={{ fontFamily: serif, fontSize: 19, fontWeight: 600, color: C.goldDeep, fontVariantNumeric: "tabular-nums" }}>{r.score}</span></div>
          <div style={{ height: 8, borderRadius: 999, background: C.canvas, overflow: "hidden" }}><div style={{ height: "100%", width: r.score + "%", borderRadius: 999, background: `linear-gradient(90deg, ${C.champagne}, ${C.gold})`, animation: "sp-bar .6s ease" }} /></div>
        </div>
      ))}{results.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: "30px 0", fontSize: 14 }}>Geen ingrediënten matchen alle filters. Verwijder een smaakprofiel.</div>}</div>
    </div>
  );
}

/* --------------------------- Supplier Portal ----------------------------- */
function SupplierPortal({ prices, meta, syncing, reSync, flash }) {
  const ids = ["salmon", "miso", "butter", "mirin", "rice", "sesame"];
  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 22, gap: 16, flexWrap: "wrap" }}><p style={{ color: C.ink, fontSize: 14.5, lineHeight: 1.6, margin: 0, maxWidth: 460 }}>Live inkoopprijzen uit de groothandel-API's. Een Re-Sync simuleert marktfluctuaties die direct doorrekenen in elke calculatie.</p><button className="sp-btn" onClick={reSync} disabled={syncing} style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 18px", borderRadius: 12, cursor: syncing ? "wait" : "pointer", fontSize: 13.5, fontWeight: 600, border: `1px solid ${C.forest}`, background: syncing ? C.forest2 : C.forest, color: "#FFF" }}><RefreshCw size={16} className={syncing ? "sp-spin" : ""} />{syncing ? "Synct met API's…" : "Force Live API Re-Sync"}</button></div>
      <div className="sp-tablewrap" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden" }}>
        <div style={{ minWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1fr 0.7fr", gap: 12, padding: "13px 20px", borderBottom: `1px solid ${C.line}`, fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}><span>Ingrediënt</span><span>Leverancier</span><span style={{ textAlign: "right" }}>Inkoopprijs</span><span style={{ textAlign: "right" }}>Trend</span></div>
          {ids.map((id) => { const m = meta[id]; const f = flash[id]; return (
            <div key={id} style={{ display: "grid", gridTemplateColumns: "2fr 1.3fr 1fr 0.7fr", gap: 12, padding: "15px 20px", borderBottom: `1px solid ${C.canvas}`, alignItems: "center", background: id === "butter" && f === "up" ? C.redSoft : "transparent", transition: "background .4s ease" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span><span style={{ fontSize: 13, color: C.muted }}>{m.supplier}</span>
              <span className={f ? "sp-pop" : ""} style={{ textAlign: "right", fontFamily: serif, fontSize: 17, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: f === "up" ? C.red : f === "down" ? C.green : C.charcoal }}>{eur(prices[id])}<span style={{ fontSize: 11, color: C.muted, fontFamily: sans }}>/{m.unit}</span></span>
              <span style={{ textAlign: "right" }}>{f === "up" ? <TrendingUp size={17} style={{ color: C.red }} /> : f === "down" ? <TrendingDown size={17} style={{ color: C.green }} /> : <span style={{ color: C.line }}>—</span>}</span>
            </div>
          ); })}
          <div style={{ padding: "12px 20px", fontSize: 12, color: C.muted, display: "flex", alignItems: "center", gap: 7 }}><span style={{ width: 7, height: 7, borderRadius: "50%", background: syncing ? C.gold : C.green }} />{syncing ? "Verbinding met leveranciers…" : "6 API-koppelingen actief"}</div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------- OCR Factuur Scan --------------------------- */
const OCR_MAP = [{ kw: ["zalm", "salmon"], id: "salmon" }, { kw: ["roomboter", "boter", "butter"], id: "butter" }, { kw: ["rijst", "rice"], id: "rice" }, { kw: ["sesam", "sesame"], id: "sesame" }, { kw: ["miso"], id: "miso" }, { kw: ["mirin"], id: "mirin" }];
function matchId(name) { const n = String(name).toLowerCase(); const hit = OCR_MAP.find((m) => m.kw.some((k) => n.includes(k))); return hit ? hit.id : null; }
function OcrScan({ setPrices }) {
  const [raw, setRaw] = useState("");
  const [stage, setStage] = useState("idle");
  const [items, setItems] = useState([]);
  const [applied, setApplied] = useState(false);
  async function scan() {
    if (stage === "scanning") return;
    setStage("scanning"); setApplied(false); setItems([]);
    const text = raw.trim() || SAMPLE_INVOICE;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1200, system: "Je bent de OCR-extractielaag van SousPlus+. Je krijgt ruwe factuurtekst en geeft UITSLUITEND geldige JSON terug: een array [{\"name\":string,\"qty\":number,\"unit\":string,\"unitPrice\":number,\"total\":number}]. Gebruik punten als decimaalteken. Geen uitleg, alleen de JSON-array.", messages: [{ role: "user", content: text }] }) });
      const data = await res.json();
      let out = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
      out = out.replace(/```json/g, "").replace(/```/g, "").trim();
      const arr = JSON.parse(out); setItems(Array.isArray(arr) ? arr : []); setStage("done");
    } catch (e) {
      setItems([{ name: "Zalmfilet vers", qty: 4.2, unit: "kg", unitPrice: 29.4, total: 123.48 }, { name: "Roomboter ongezouten", qty: 2.0, unit: "kg", unitPrice: 11.2, total: 22.4 }, { name: "Sushirijst koshihikari", qty: 8.0, unit: "kg", unitPrice: 3.95, total: 31.6 }, { name: "Sesamzaad geroosterd", qty: 0.5, unit: "kg", unitPrice: 11.3, total: 5.65 }, { name: "Mirin Hon", qty: 2.0, unit: "L", unitPrice: 9.8, total: 19.6 }]); setStage("done");
    }
  }
  function applyPrices() { setPrices((prev) => { const next = { ...prev }; items.forEach((it) => { const id = matchId(it.name); if (id && it.unitPrice) next[id] = +Number(it.unitPrice).toFixed(2); }); return next; }); setApplied(true); }
  const matched = items.filter((it) => matchId(it.name)).length;
  return (
    <div style={{ maxWidth: 860 }}>
      <p style={{ color: C.ink, fontSize: 14.5, lineHeight: 1.6, marginTop: 0, marginBottom: 20, maxWidth: 560 }}>Scan een leveranciersfactuur — geen handmatige invoer meer. De OCR-laag (Tier 1) leest de regels uit en koppelt ze aan je voorraadprijzen, zodat je calculaties automatisch kloppen.</p>
      <div className="sp-ocr2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" }}>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 20 }}>
          <div style={{ position: "relative", border: `2px dashed ${C.line}`, borderRadius: 14, padding: "26px 18px", textAlign: "center", overflow: "hidden", marginBottom: 14, background: C.canvas }}>{stage === "scanning" && <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: C.gold, boxShadow: `0 0 12px ${C.gold}`, animation: "sp-scan 1.4s linear infinite" }} />}<div style={{ width: 48, height: 48, borderRadius: 12, background: C.champagneSoft, display: "grid", placeItems: "center", margin: "0 auto 10px" }}><FileText size={24} style={{ color: C.goldDeep }} /></div><div style={{ fontSize: 13.5, fontWeight: 600 }}>factuur_sligro_04412.pdf</div><div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>of plak hieronder de factuurtekst</div></div>
          <textarea className="sp-input" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Plak hier de tekst van een factuur…" rows={5} style={{ width: "100%", padding: 12, borderRadius: 12, border: `1px solid ${C.line}`, background: C.canvas, fontFamily: sans, fontSize: 13, color: C.charcoal, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="sp-btn" onClick={() => setRaw(SAMPLE_INVOICE)} style={{ padding: "10px 14px", borderRadius: 11, border: `1px solid ${C.line}`, background: C.card, color: C.ink, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Voorbeeld</button><button className="sp-btn" onClick={scan} disabled={stage === "scanning"} style={{ flex: 1, padding: "10px 14px", borderRadius: 11, border: "none", background: stage === "scanning" ? C.forest2 : C.forest, color: "#FFF", cursor: stage === "scanning" ? "wait" : "pointer", fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{stage === "scanning" ? <Loader2 size={16} className="sp-spin" /> : <ScanLine size={16} />}{stage === "scanning" ? "Scant factuur…" : "Scan factuur"}</button></div>
        </div>
        <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 20, minHeight: 200 }}>
          {stage !== "done" && <div style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: "50px 0" }}>{stage === "scanning" ? "Regels worden uitgelezen…" : "Nog geen factuur gescand."}</div>}
          {stage === "done" && (<div><div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}><CheckCircle2 size={16} style={{ color: C.green }} /><span style={{ fontWeight: 600, fontSize: 14 }}>{items.length} regels herkend · {matched} gekoppeld</span></div>{items.map((it, i) => { const id = matchId(it.name); return (<div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.canvas}` }}><div style={{ minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 500 }}>{it.name}</div><div style={{ fontSize: 11.5, color: C.muted }}>{String(it.qty).replace(".", ",")} {it.unit} {id && <span style={{ color: C.green }}>· gekoppeld</span>}</div></div><div style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{eur(it.unitPrice)}</div><div style={{ fontSize: 11.5, color: C.muted }}>{eur(it.total)}</div></div></div>); })}<button className="sp-btn" onClick={applyPrices} disabled={applied || matched === 0} style={{ width: "100%", marginTop: 14, padding: "11px 14px", borderRadius: 11, border: `1px solid ${C.gold}`, background: applied ? C.greenSoft : C.champagneSoft, color: applied ? C.green : C.goldDeep, cursor: applied ? "default" : "pointer", fontSize: 13.5, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>{applied ? <><CheckCircle2 size={16} /> Voorraadprijzen bijgewerkt</> : <><Upload size={16} /> Werk voorraadprijzen bij</>}</button></div>)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- HACCP ----------------------------------- */
function Haccp({ haccp, setHaccpValue, resetHaccp, auditLog, storageState }) {
  const [showLog, setShowLog] = useState(false);
  const done = haccp.filter((h) => h.status !== "pending").length;
  const attention = haccp.filter((h) => h.status === "attention").length;
  const recent = auditLog.slice(-8).reverse();
  return (
    <div style={{ maxWidth: 880 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, gap: 16, flexWrap: "wrap" }}><p style={{ color: C.ink, fontSize: 14.5, lineHeight: 1.6, margin: 0, maxWidth: 480 }}>Dagstaat voedselveiligheid. Vul de gemeten waardes in — de norm wordt automatisch gecontroleerd en elke meting wordt permanent vastgelegd in het audit-logboek.</p><button className="sp-btn" onClick={resetHaccp} style={{ padding: "10px 16px", borderRadius: 11, border: `1px solid ${C.line}`, background: C.card, color: C.ink, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><ClipboardCheck size={15} /> Nieuwe dagstaat</button></div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18, fontSize: 12, color: storageState === "on" ? C.green : C.muted, background: storageState === "on" ? C.greenSoft : C.canvas, border: `1px solid ${storageState === "on" ? "transparent" : C.line}`, padding: "8px 12px", borderRadius: 10, width: "fit-content" }}><Lock size={14} />{storageState === "on" ? "Registraties worden permanent en manipulatie-bestendig bewaard." : storageState === "loading" ? "Opslag wordt geladen…" : "Opslag niet beschikbaar in deze weergave — registraties zijn tijdelijk."}</div>

      <div style={{ display: "flex", gap: 14, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 16px" }}><div style={{ fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>Voortgang</div><div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, marginTop: 3 }}>{done}/{haccp.length}</div></div>
        <div style={{ flex: "1 1 140px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 16px" }}><div style={{ fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>Aandacht</div><div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, marginTop: 3, color: attention ? C.red : C.green }}>{attention}</div></div>
        <div style={{ flex: "1 1 140px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 16px" }}><div style={{ fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>Vastgelegd</div><div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, marginTop: 3, color: C.gold }}>{auditLog.length}</div></div>
      </div>

      <div className="sp-tablewrap" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden", marginBottom: 18 }}>
        <div style={{ minWidth: 620 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.1fr 0.8fr 0.7fr", gap: 12, padding: "13px 20px", borderBottom: `1px solid ${C.line}`, fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}><span>Registratiepunt</span><span>Norm</span><span>Meting</span><span>Tijd</span><span style={{ textAlign: "right" }}>Status</span></div>
          {haccp.map((h) => (
            <div key={h.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.1fr 0.8fr 0.7fr", gap: 12, padding: "13px 20px", borderBottom: `1px solid ${C.canvas}`, alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}><Thermometer size={15} style={{ color: C.muted }} />{h.zone}</span>
              <span style={{ fontSize: 13, color: C.muted }}>{h.target}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><input className="sp-input" value={h.value} onChange={(e) => setHaccpValue(h.id, e.target.value)} placeholder="—" inputMode="decimal" style={{ width: 64, padding: "7px 9px", borderRadius: 9, border: `1px solid ${C.line}`, background: C.canvas, fontFamily: sans, fontSize: 14, color: C.charcoal, textAlign: "center" }} /><span style={{ fontSize: 12.5, color: C.muted }}>{h.unit}</span></span>
              <span style={{ fontSize: 13, color: C.muted, fontVariantNumeric: "tabular-nums" }}>{h.time || "—"}</span>
              <span style={{ textAlign: "right" }}>{h.status === "pending" && <span style={{ fontSize: 12, color: C.muted, display: "inline-flex", alignItems: "center", gap: 5 }}><Clock size={14} /> open</span>}{h.status === "ok" && <span style={{ fontSize: 12, color: C.green, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}><CheckCircle2 size={15} /> OK</span>}{h.status === "attention" && <span style={{ fontSize: 12, color: C.red, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 5 }}><AlertTriangle size={15} /> actie</span>}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden" }}>
        <button className="sp-btn" onClick={() => setShowLog((s) => !s)} style={{ width: "100%", padding: "14px 20px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", color: C.charcoal }}><span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 600, fontSize: 14 }}><History size={16} style={{ color: C.gold }} /> Audit-logboek · {auditLog.length} registraties</span><ArrowRight size={16} style={{ transform: showLog ? "rotate(90deg)" : "none", transition: "transform .2s", color: C.muted }} /></button>
        {showLog && (
          <div style={{ borderTop: `1px solid ${C.line}` }}>
            {recent.length === 0 && <div style={{ padding: "20px", textAlign: "center", color: C.muted, fontSize: 13 }}>Nog geen registraties vastgelegd.</div>}
            {recent.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 20px", borderBottom: `1px solid ${C.canvas}`, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Lock size={12} style={{ color: C.muted }} /><span style={{ fontWeight: 500 }}>{r.zone}</span><span style={{ color: C.muted }}>{r.value}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.muted }}><span style={{ color: r.status === "ok" ? C.green : r.status === "attention" ? C.red : C.muted, fontWeight: 600 }}>{r.status === "ok" ? "OK" : r.status === "attention" ? "actie" : "—"}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{r.date} {r.time}</span><span style={{ fontSize: 11.5 }}>{r.by}</span></div>
              </div>
            ))}
            <div style={{ padding: "10px 20px", fontSize: 11.5, color: C.muted }}>Registraties zijn append-only: ze worden vastgelegd met tijdstempel en ondertekenaar en kunnen niet achteraf worden gewijzigd.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------- Ingrediëntencatalogus ----------------------- */
const SUP_COLOR = { Hanos: { bg: "#E9F0F4", fg: "#3E6E8C" }, Sligro: { bg: "#EAF1EC", fg: "#3F7A5B" }, Beide: { bg: "#F7F1E6", fg: "#8C6E3C" } };
function IngredientsCatalog() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("Alle");
  const [sup, setSup] = useState("Alle");
  const [limit, setLimit] = useState(60);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return INGREDIENTS.filter((it) =>
      (cat === "Alle" || it.cat === cat) &&
      (sup === "Alle" || it.supplier === sup || (sup !== "Beide" && it.supplier === "Beide")) &&
      (term === "" || it.name.toLowerCase().includes(term) || it.cat.toLowerCase().includes(term))
    );
  }, [q, cat, sup]);
  useEffect(() => { setLimit(60); }, [q, cat, sup]);
  const shown = filtered.slice(0, limit);
  const nHanos = INGREDIENTS.filter((i) => i.supplier === "Hanos" || i.supplier === "Beide").length;
  const nSligro = INGREDIENTS.filter((i) => i.supplier === "Sligro" || i.supplier === "Beide").length;

  return (
    <div>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 13px", borderRadius: 999, background: C.champagneSoft, border: `1px solid ${C.champagne}`, color: C.goldDeep, fontSize: 12, fontWeight: 600, marginBottom: 14 }}><Store size={14} /> Hanos & Sligro assortiment · indicatieve groothandelsprijzen · feed-ready</div>
      <p style={{ color: C.ink, fontSize: 14.5, lineHeight: 1.6, marginTop: 0, marginBottom: 18, maxWidth: 620 }}>Een doorzoekbare basis van {INGREDIENTS.length} kernartikelen over {ING_CATS.length - 1} categorieën — de ruggengraat van je inkoop. In productie schakelt hier de live Hanos/Sligro-koppeling in, zodat het volledige assortiment en de actuele dagprijzen automatisch binnenkomen.</p>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 220px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 16px" }}><div style={{ fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>Artikelen</div><div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, marginTop: 3 }}>{INGREDIENTS.length}</div></div>
        <div style={{ flex: "1 1 220px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 16px" }}><div style={{ fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>Via Hanos</div><div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, marginTop: 3, color: SUP_COLOR.Hanos.fg }}>{nHanos}</div></div>
        <div style={{ flex: "1 1 220px", background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 16px" }}><div style={{ fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase" }}>Via Sligro</div><div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, marginTop: 3, color: SUP_COLOR.Sligro.fg }}>{nSligro}</div></div>
      </div>

      <div style={{ position: "relative", marginBottom: 12 }}><PackageSearch size={18} style={{ position: "absolute", left: 16, top: 15, color: C.muted }} /><input className="sp-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek een artikel of categorie… (bv. zalm, miso, room, saffraan)" style={{ width: "100%", padding: "13px 16px 13px 46px", borderRadius: 14, fontSize: 15, border: `1px solid ${C.line}`, background: C.card, color: C.charcoal, fontFamily: sans }} /></div>

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12, color: C.muted, marginRight: 2 }}>Leverancier:</span>
        {ING_SUPPLIERS.map((s) => { const on = sup === s; return <button key={s} className="sp-btn" onClick={() => setSup(s)} style={{ padding: "6px 13px", borderRadius: 999, cursor: "pointer", fontSize: 12.5, fontWeight: 600, border: `1px solid ${on ? C.gold : C.line}`, background: on ? C.gold : C.card, color: on ? "#FFF" : C.ink }}>{s}</button>; })}
      </div>
      <div className="sp-scroll" style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {ING_CATS.map((c) => { const on = cat === c; return <button key={c} className="sp-btn" onClick={() => setCat(c)} style={{ flexShrink: 0, padding: "7px 13px", borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: on ? 700 : 500, border: `1px solid ${on ? C.gold : C.line}`, background: on ? C.champagneSoft : C.card, color: on ? C.goldDeep : C.muted }}>{c}</button>; })}
      </div>

      <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 10 }}>{filtered.length} resultaten{cat !== "Alle" ? " in " + cat : ""}{q.trim() ? ` voor "${q.trim()}"` : ""}</div>

      <div className="sp-tablewrap" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden" }}>
        <div style={{ minWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2.4fr 1.4fr 1fr 0.9fr", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.line}`, fontSize: 11, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase", fontWeight: 600 }}><span>Artikel</span><span>Categorie</span><span>Leverancier</span><span style={{ textAlign: "right" }}>Prijs</span></div>
          {shown.map((it) => { const sc = SUP_COLOR[it.supplier] || SUP_COLOR.Beide; return (
            <div key={it.id} style={{ display: "grid", gridTemplateColumns: "2.4fr 1.4fr 1fr 0.9fr", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.canvas}`, alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{it.name}</span>
              <span style={{ fontSize: 12.5, color: C.muted }}>{it.cat}</span>
              <span><span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, background: sc.bg, color: sc.fg }}>{it.supplier}</span></span>
              <span style={{ textAlign: "right", fontFamily: serif, fontSize: 15.5, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{eur(it.price)}<span style={{ fontSize: 11, color: C.muted, fontFamily: sans }}>/{it.unit}</span></span>
            </div>
          ); })}
          {shown.length === 0 && <div style={{ padding: "36px 20px", textAlign: "center", color: C.muted, fontSize: 14 }}>Geen artikelen gevonden. Pas je zoekterm of filters aan.</div>}
        </div>
      </div>
      {filtered.length > limit && <div style={{ textAlign: "center", marginTop: 16 }}><button className="sp-btn" onClick={() => setLimit((l) => l + 80)} style={{ padding: "11px 22px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.ink, cursor: "pointer", fontSize: 13.5, fontWeight: 600 }}>Toon meer ({filtered.length - limit} resterend)</button></div>}
    </div>
  );
}

/* --------------------------- Recipe Library ------------------------------ */
function RecipeLibrary({ libCat, setLibCat, favs, setFavs, liveSalmonMargin, goTo, setActiveVersion }) {
  const items = LIBRARY.filter((r) => libCat === "All" || r.cat === libCat);
  function open(r) { if (r.id === "salmon") { setActiveVersion("v1.2"); goTo("lab"); } }
  return (
    <div>
      <div className="sp-scroll" style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: `1px solid ${C.line}`, overflowX: "auto" }}>{LIB_CATS.map((cat) => { const on = libCat === cat; const count = cat === "All" ? LIBRARY.length : LIBRARY.filter((r) => r.cat === cat).length; return (<button key={cat} className="sp-tab sp-btn" onClick={() => setLibCat(cat)} style={{ flexShrink: 0, padding: "10px 16px 13px", background: "transparent", border: "none", cursor: "pointer", fontSize: 14, fontWeight: on ? 700 : 500, color: on ? C.charcoal : C.muted, borderBottom: `2px solid ${on ? C.gold : "transparent"}`, marginBottom: -1 }}>{cat}<span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>{count}</span></button>); })}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>{items.map((r) => { const m = r.id === "salmon" ? liveSalmonMargin : r.margin; const crit = m < 70; const clickable = r.id === "salmon"; return (
        <div key={r.id} className="sp-card" onClick={() => open(r)} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, overflow: "hidden", cursor: clickable ? "pointer" : "default" }}>
          <div style={{ background: C.canvas, padding: "18px 0", display: "grid", placeItems: "center", position: "relative" }}>
            <Plate palette={r.palette} size={104} glaze={r.id === "salmon"} />
            <button className="sp-btn" aria-label="Favoriet" onClick={(e) => { e.stopPropagation(); setFavs((f) => ({ ...f, [r.id]: !f[r.id] })); }} style={{ position: "absolute", top: 12, right: 12, width: 36, height: 36, borderRadius: "50%", border: `1px solid ${C.line}`, background: C.card, cursor: "pointer", display: "grid", placeItems: "center" }}><Heart size={17} style={{ color: favs[r.id] ? C.red : C.muted }} fill={favs[r.id] ? C.red : "none"} /></button>
            {clickable && <span style={{ position: "absolute", bottom: 10, left: 12, fontSize: 10.5, fontWeight: 600, color: C.goldDeep, background: C.champagneSoft, padding: "3px 9px", borderRadius: 999, display: "flex", alignItems: "center", gap: 4 }}>Open in Lab <ArrowRight size={11} /></span>}
          </div>
          <div style={{ padding: "16px 18px 18px" }}><div style={{ fontSize: 11, letterSpacing: "0.1em", color: C.gold, textTransform: "uppercase", fontWeight: 600 }}>{r.cat}</div><div style={{ fontFamily: serif, fontSize: 19, fontWeight: 600, margin: "3px 0 12px", letterSpacing: "-0.01em" }}>{r.name}</div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: 11, color: C.muted }}>Menuprijs</div><div style={{ fontSize: 15, fontWeight: 600 }}>{eur(r.price)}</div></div><div style={{ padding: "5px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, background: crit ? C.redSoft : C.greenSoft, color: crit ? C.red : C.green }}>{pct(m)} marge</div></div></div>
        </div>
      ); })}</div>
    </div>
  );
}

/* ----------------------------- Menu Matrix ------------------------------- */
function MenuMatrix({ liveSalmonMargin, goTo, setActiveVersion }) {
  const POP_MID = 150, MARGIN_MID = 72;
  const data = LIBRARY.map((r) => ({ ...r, m: r.id === "salmon" ? liveSalmonMargin : r.margin }));
  function quad(d) { const hi = d.pop >= POP_MID, hm = d.m >= MARGIN_MID; return hi && hm ? "star" : hi && !hm ? "plow" : !hi && hm ? "puzzle" : "dog"; }
  const QUAD = { star: { label: "Sterren", color: C.green, tip: "Hoge marge én populair — koester en houd zichtbaar." }, plow: { label: "Werkpaarden", color: C.amber, tip: "Populair maar magere marge — verlaag foodcost of verhoog prijs." }, puzzle: { label: "Puzzels", color: C.blue, tip: "Goede marge, weinig verkocht — promoot of herpositioneer." }, dog: { label: "Honden", color: C.red, tip: "Lage marge én weinig verkocht — heroverweeg of schrap." } };
  // chart geometry
  const W = 560, H = 380, padL = 52, padB = 44, padT = 16, padR = 16;
  const x0 = padL, x1 = W - padR, y0 = H - padB, y1 = padT;
  const popMin = 40, popMax = 320, marMin = 60, marMax = 86;
  const sx = (p) => x0 + ((p - popMin) / (popMax - popMin)) * (x1 - x0);
  const sy = (m) => y0 - ((m - marMin) / (marMax - marMin)) * (y0 - y1);
  const mx = sx(POP_MID), my = sy(MARGIN_MID);
  const counts = data.reduce((o, d) => ((o[quad(d)] = (o[quad(d)] || 0) + 1), o), {});
  return (
    <div style={{ maxWidth: 920 }}>
      <p style={{ color: C.ink, fontSize: 14.5, lineHeight: 1.6, marginTop: 0, marginBottom: 20, maxWidth: 560 }}>Menu-engineering volgens de Boston-matrix: elk gerecht uitgezet op populariteit (couverts p/m) tegen marge. Zo zie je vóór de service welke gerechten dragen, welke verlies lekken en welke aandacht nodig hebben.</p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(220px, 1fr)", gap: 20, alignItems: "start" }} className="sp-lab2">
        <div className="sp-card" style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16 }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }}>
            <rect x={mx} y={y1} width={x1 - mx} height={my - y1} fill={C.green} opacity="0.06" />
            <rect x={mx} y={my} width={x1 - mx} height={y0 - my} fill={C.amber} opacity="0.06" />
            <rect x={x0} y={y1} width={mx - x0} height={my - y1} fill={C.blue} opacity="0.06" />
            <rect x={x0} y={my} width={mx - x0} height={y0 - my} fill={C.red} opacity="0.06" />
            <line x1={mx} y1={y1} x2={mx} y2={y0} stroke={C.line} strokeDasharray="4 4" />
            <line x1={x0} y1={my} x2={x1} y2={my} stroke={C.line} strokeDasharray="4 4" />
            <line x1={x0} y1={y0} x2={x1} y2={y0} stroke={C.muted} strokeWidth="1" />
            <line x1={x0} y1={y1} x2={x0} y2={y0} stroke={C.muted} strokeWidth="1" />
            <text x={x0 + 8} y={y1 + 16} fontSize="11" fontWeight="700" fill={C.blue} fontFamily={sans}>PUZZELS</text>
            <text x={x1 - 8} y={y1 + 16} fontSize="11" fontWeight="700" fill={C.green} textAnchor="end" fontFamily={sans}>STERREN</text>
            <text x={x0 + 8} y={y0 - 8} fontSize="11" fontWeight="700" fill={C.red} fontFamily={sans}>HONDEN</text>
            <text x={x1 - 8} y={y0 - 8} fontSize="11" fontWeight="700" fill={C.amber} textAnchor="end" fontFamily={sans}>WERKPAARDEN</text>
            <text x={(x0 + x1) / 2} y={H - 8} fontSize="11" fill={C.muted} textAnchor="middle" fontFamily={sans}>Populariteit · couverts p/m →</text>
            <text x={14} y={(y0 + y1) / 2} fontSize="11" fill={C.muted} textAnchor="middle" fontFamily={sans} transform={`rotate(-90 14 ${(y0 + y1) / 2})`}>Marge % ↑</text>
            {data.map((d) => { const q = quad(d); const col = QUAD[q].color; return (
              <g key={d.id} style={{ cursor: d.id === "salmon" ? "pointer" : "default" }} onClick={() => { if (d.id === "salmon") { setActiveVersion("v1.2"); goTo("lab"); } }}>
                <circle cx={sx(d.pop)} cy={sy(d.m)} r="8" fill={col} stroke="#FFF" strokeWidth="2" />
                <text x={sx(d.pop)} y={sy(d.m) - 13} fontSize="10.5" fill={C.charcoal} textAnchor="middle" fontFamily={sans} fontWeight="600">{d.name.split(" ")[0]}</text>
              </g>
            ); })}
          </svg>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {["star", "plow", "puzzle", "dog"].map((q) => (
            <div key={q} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "13px 15px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: "50%", background: QUAD[q].color }} /><span style={{ fontWeight: 700, fontSize: 13.5 }}>{QUAD[q].label}</span></div><span style={{ fontFamily: serif, fontSize: 16, fontWeight: 600, color: QUAD[q].color }}>{counts[q] || 0}</span></div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45 }}>{QUAD[q].tip}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16, background: C.champagneSoft, border: `1px solid ${C.champagne}`, borderRadius: 14, padding: "14px 18px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <Wand2 size={17} style={{ color: C.goldDeep, flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.55 }}>De <strong>Miso-Glazed Salmon</strong> staat op {pct(liveSalmonMargin)} marge en {liveSalmonMargin < MARGIN_MID ? "valt daarmee in de werkpaarden — populair, maar de marge lekt. Vraag Chef Auguste om een goedkopere variant of bescherm de marge via de Waakhond." : "houdt daarmee stand als ster van de kaart."}</div>
      </div>
    </div>
  );
}
