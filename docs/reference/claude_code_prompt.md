# Claude Code — Bouwopdracht: SousPlus+ Premium (productieversie)

> Dit is een bestaand project. Er staan mogelijk oudere prototypevarianten in de map (zoals `SousPlusPremiumMVP.jsx`, `SousPlusPremiumTablet.jsx`, `SousPlusPremium.jsx`). **Negeer die volledig.** De enige bestanden die tellen zijn:
> - `SousPlusPremiumApp.jsx` — de werkende prototype/MVP. **Dit is de exclusieve bron van waarheid voor scope, functionaliteit, UX-flows en visuele stijl.**
> - `sousplus_ingredienten.csv` — seed-catalogus (417 foodservice-artikelen, Hanos/Sligro).
> - `claude_code_prompt.md` — dit bestand (de bouwopdracht zelf).

---

## Rol & doel

Je bouwt de **productieversie** van SousPlus+ Premium: een B2B-SaaS "digitale sous-chef" voor professionele keukens. Het bijgeleverde `SousPlusPremiumApp.jsx` is een single-file React-prototype dat alle functionaliteit en de visuele taal vastlegt. Repliceer dat gedrag exact, maar herbouw het als een **schaalbare, veilige, productiewaardige applicatie**. Werk incrementeel: lever per fase werkende, geteste code op en vraag om akkoord voordat je doorgaat.

## Architectuur (niet-onderhandelbaar)

1. **Eén responsieve codebase.** Geen aparte desktop-/tabletbestanden. Breakpoint-gedreven layout (sidebar ≥ ~980px, scrollbare topnav daaronder; tabellen horizontaal scrollbaar; grids klappen in). Touch-vriendelijke targets.
2. **Roep het LLM nooit vanuit de browser aan.** Alle AI-calls lopen via de eigen backend. De API-sleutel staat uitsluitend server-side.
3. **Intelligent Router server-side.** Modelkeuze per taak: Tier 1 (volume/goedkoop, bv. OCR-extractie en eenvoudige classificatie) → een licht/goedkoop model; Tier 2 (advies, tool-use, gestructureerde output → de "Chef Auguste"-laag) → een sterk model (Claude Sonnet-klasse). Maak de router **model-agnostisch** (adapterpatroon, modelnamen in config, niet hardcoded). Implementeer response-caching op Tier 1 om de COGS te drukken, plus logging en rate-limiting.
4. **Tool-use / function-calling via de officiële API**, server-side uitgevoerd binnen een tool-loop. De prototype-tools zijn: `save_recipe_version`, `update_recipe_version`, `prepare_haccp`, `fill_haccp`, `switch_supplier`, `navigate_app`, `search_ingredients`. Valideer elke tool-input server-side tegen een schema (bv. zod) vóór uitvoering. Vraag bevestiging bij destructieve/overschrijvende acties.
5. **Persistente opslag** in een echte database (PostgreSQL voorkeur). Multi-tenant met authenticatie/autorisatie per keuken/locatie.
6. **HACCP = compliance, geen checklist.** Registraties moeten **append-only, tamper-evident en bewaarplichtig** zijn: onveranderlijke records met tijdstempel, meetwaarde, status (norm-check) en ondertekenaar; volledige audit trail; retentiebeleid. Overweeg hash-chaining van records voor manipulatiedetectie.

## Vastgestelde stack (definitief — niet afwijken zonder overleg)

- **Frontend:** Next.js (App Router) + React + **TypeScript**, **Tailwind CSS**. Zet de designtokens (zie onder) in `tailwind.config` als theme-extensie + CSS-variabelen — geen losse inline-kleuren.
- **Backend:** Next.js **route handlers** (server-side) met de **Anthropic TypeScript SDK**. Alle LLM-calls en de Intelligent Router draaien hier; de API-sleutel staat uitsluitend in server-side env (`.env`, nooit in client-code of de repo).
- **Database/ORM:** **PostgreSQL + Prisma** (EU-regio i.v.m. AVG).
- **Auth:** **Auth.js (NextAuth)**, multi-tenant per keuken/locatie vanaf dag één (organisatie → locaties → gebruikers met rollen).
- **Validatie:** **zod** voor alle API-inputs én voor server-side validatie van tool-use-argumenten vóór uitvoering.
- **State (client):** lichte store (Zustand of React Context) voor o.a. de Chef Auguste-conversatie, zodat die behouden blijft bij navigeren.
- **Tests:** Vitest (unit), React Testing Library (component), **Playwright** (e2e voor de demoflows).

## Datamodel (vertrekpunt — Prisma, pas aan waar nodig)

Multi-tenant kern: `Organization → Location → User`. Receptuur, catalogus en HACCP hangen aan een `Location`. HACCP-records zijn **append-only met hash-chaining** (elk record bevat de hash van het vorige) voor manipulatiedetectie.

```prisma
model Organization { id String @id @default(cuid()) name String; locations Location[]; createdAt DateTime @default(now()) }

model Location {
  id String @id @default(cuid())
  orgId String; org Organization @relation(fields:[orgId], references:[id])
  name String
  users User[]; recipes Recipe[]; catalog CatalogItem[]
  haccpCheckpoints HaccpCheckpoint[]; haccpRecords HaccpRecord[]
  conversations ChefConversation[]; alerts MarginAlert[]
}

model User {
  id String @id @default(cuid())
  locationId String; location Location @relation(fields:[locationId], references:[id])
  name String; email String @unique
  role Role @default(CHEF)            // OWNER | EXEC_CHEF | CHEF | STAFF
}
enum Role { OWNER EXEC_CHEF CHEF STAFF }

model Recipe {
  id String @id @default(cuid())
  locationId String; location Location @relation(fields:[locationId], references:[id])
  dish String                         // gerechtnaam
  category String
  menuPrice Decimal @db.Decimal(10,2)
  popularity Int @default(0)          // couverts p/m → Menu Matrix
  isOnMenu Boolean @default(true)     // Recipe Library
  favorite Boolean @default(false)
  versions RecipeVersion[]
  activeVersionId String?
}

model RecipeVersion {
  id String @id @default(cuid())
  recipeId String; recipe Recipe @relation(fields:[recipeId], references:[id])
  label String                        // "v1.2"
  name String                         // "Witte Miso"
  note String?
  prepTimeMin Int
  steps String[]                      // bereidingswijze
  ingredients RecipeIngredient[]
  createdAt DateTime @default(now())
}

model RecipeIngredient {
  id String @id @default(cuid())
  versionId String; version RecipeVersion @relation(fields:[versionId], references:[id])
  catalogItemId String?               // koppeling naar catalogus (optioneel)
  name String
  amount Decimal @db.Decimal(10,3)    // gram/ml (WEIGHT) of aantal (PIECE)
  unit String                         // g, ml, stuk, fles, ...
  mode CostMode @default(WEIGHT)      // WEIGHT = (amount/1000)*price/kg ; PIECE = amount*price/eenheid
  pricePerUnit Decimal @db.Decimal(10,2) // snapshot; live prijs via CatalogItem/IngredientPrice
}
enum CostMode { WEIGHT PIECE }

model CatalogItem {                    // Hanos/Sligro-assortiment (seed uit CSV)
  id String @id @default(cuid())
  locationId String; location Location @relation(fields:[locationId], references:[id])
  externalId String?                  // SKU bij leverancier (voor live feed)
  name String; category String
  supplier Supplier
  unit String
  price Decimal @db.Decimal(10,2)
  priceHistory IngredientPrice[]
  @@index([locationId, category])
}
enum Supplier { HANOS SLIGRO BEIDE }

model IngredientPrice {               // prijshistorie / live re-sync
  id String @id @default(cuid())
  catalogItemId String; item CatalogItem @relation(fields:[catalogItemId], references:[id])
  price Decimal @db.Decimal(10,2)
  source String                       // "feed:hanos" | "ocr" | "manual"
  recordedAt DateTime @default(now())
}

model HaccpCheckpoint {               // configuratie van een registratiepunt
  id String @id @default(cuid())
  locationId String; location Location @relation(fields:[locationId], references:[id])
  zone String                         // "Koeling 1 · vis"
  target String                       // "≤ 4 °C"
  limitValue Decimal @db.Decimal(8,2)
  cmp Cmp                             // LTE | GTE
  unit String                         // "°C"
  active Boolean @default(true)
}
enum Cmp { LTE GTE }

model HaccpRecord {                    // APPEND-ONLY, tamper-evident audit trail
  id String @id @default(cuid())
  locationId String; location Location @relation(fields:[locationId], references:[id])
  checkpointId String
  zone String; target String
  value Decimal @db.Decimal(8,2); unit String
  status HaccpStatus                  // OK | ATTENTION
  recordedAt DateTime @default(now())
  signedById String; signedByName String
  prevHash String?                    // hash van vorige record (chain)
  hash String                         // hash(payload + prevHash)
  // GEEN updatedAt / geen updates: records zijn onveranderlijk; correcties = nieuw record
}
enum HaccpStatus { OK ATTENTION }

model ChefConversation {              // persistente Chef Auguste-historie
  id String @id @default(cuid())
  locationId String; location Location @relation(fields:[locationId], references:[id])
  userId String
  messages ChefMessage[]
  createdAt DateTime @default(now())
}
model ChefMessage {
  id String @id @default(cuid())
  conversationId String; conversation ChefConversation @relation(fields:[conversationId], references:[id])
  role MsgRole                        // USER | ASSISTANT | TOOL
  content String                      // tekst of JSON (tool_use / tool_result)
  toolName String?
  createdAt DateTime @default(now())
}
enum MsgRole { USER ASSISTANT TOOL }

model MarginAlert {
  id String @id @default(cuid())
  locationId String; location Location @relation(fields:[locationId], references:[id])
  ingredient String; deltaPct Decimal @db.Decimal(6,2)
  affectedRecipeId String?
  resolved Boolean @default(false); resolution String?
  createdAt DateTime @default(now())
}
```

Belangrijk: bedragen als `Decimal` (nooit floats voor geld). De foodcost-/margemotor is een **pure, los geteste functie** die over `RecipeIngredient[]` rekent met de `mode`-logica hierboven; marge = `(menuPrice − foodcost) / menuPrice`. De Marge-Waakhond draait dezelfde motor tegen een gewijzigde `IngredientPrice`.

## Designsysteem (overnemen uit het prototype)

- Diep-groen `#15271C` (donkere vlakken/sidebar), forest-varianten `#0E1A12 / #1E3527 / #2E4A38`.
- Champagne-goud accent `#F0E6D2`, dieper goud voor tekst `#A8884E / #8C6E3C`.
- Off-white canvas `#F4F2EC`, witte cards `#FFFFFF`, lijn `#E8E3D8`.
- Status: groen `#3F7A5B`, rood `#B4412E`, amber `#B6892F`, blauw `#3E6E8C` (+ soft-varianten).
- Typografie: serif **Fraunces** voor koppen/cijfers, **Inter** voor body. Iconen: lucide.
- Sfeer: luxe minimalisme, rustige micro-animaties, royale witruimte.

## Modules (gedrag 1-op-1 overnemen)

1. **AI Sous-Chef "Chef Auguste"** — geen chatbot maar een brigade-souschef op Michelin-niveau; gerenderd als "chef's pass"-briefing (goud-omrande kaarten, toque-monogram), niet als chatbubbels. Heeft via context live zicht op recepturen, prijzen, marges, pairings, HACCP en de catalogus, en voert acties uit via tool-use. **Verbeterpunt t.o.v. prototype:** til de gespreksstate uit de component (server- of store-gebaseerd) zodat de conversatie behouden blijft bij navigeren en herladen.
2. **Recipe Lab** — versiebeheer (timeline), couverts/portieschaler, Kitchen View die financiële data verbergt, en **live foodcost/marge uit echte ingrediënt-math**. Ingrediënten zijn bewerkbaar (hoeveelheid aanpassen, verwijderen) en toe te voegen vanuit de catalogus-picker. Kostenmodel: gewicht-items (kg/L) = (gram/1000) × prijs-per-kg; stuk-items (fles/bak/tray/…) = aantal × prijs-per-eenheid.
3. **Flavor Matcher** — affinity-scores met smaakfilters (Umami/Fatty/Acidic). Houd de eerlijke labeling aan: gecureerde dataset nu, Foodpairing®-koppeling als fase 2.
4. **Supplier Portal** — live inkoopprijzen; nu gesimuleerde re-sync met fluctuaties → in productie echte leveranciersfeeds.
5. **Factuur Scan (OCR)** — factuur → gestructureerde regels → koppeling aan voorraadprijzen. Productie: echte beeld/PDF-OCR (visionmodel of OCR-service), nu tekst-paste-demo.
6. **HACCP-light** — dagstaat met automatische norm-check + audit trail (zie compliance-eisen hierboven).
7. **Recipe Library** — menukaart-grid; kaarten openen het recept in de Recipe Lab.
8. **Menu Matrix** — Boston-grid (populariteit × marge → sterren/werkpaarden/puzzels/honden) met advies per kwadrant.
9. **Ingrediëntencatalogus** — doorzoekbaar/filterbaar (categorie, leverancier). Seed uit `sousplus_ingredienten.csv`; in productie gevoed door de live Hanos/Sligro-feed. Voorzie een import-/sync-laag (adapterpatroon).

Globaal: **Marge-Waakhond** — notificatie bij margebedreiging (bv. boterprijs +14% → marge Miso Salmon < 70%) met oplosacties ("wissel leverancier" / "prijs accepteren") die de marge herstellen.

## Gesimuleerd in de demo → vervangen door echte integratie

- Supplier-prijzen & re-sync → echte Hanos/Sligro-data/feeds (adapter per leverancier).
- OCR → echte document-OCR.
- Ingrediëntencatalogus → volledige live assortimentskoppeling (de 417 seed-artikelen zijn representatief, geen volledig assortiment).
- LLM-calls die nu rechtstreeks vanuit het prototype gaan → volledig server-side router.
- In-memory/tab-lokale state → database + auth.

## Buiten scope (bewust)

B2C Basic-tier, spraakbesturing, POS-integratie, personeelsplanning. Visuele AI-plating valt buiten de MVP.

## Werkwijze (gefaseerd — bevestig per fase)

Bouw **niet alles in één keer**. Werk het meegeleverde datamodel en de router/tool-architectuur eerst uit tot een korte blauwdruk en vraag akkoord. Lever daarna per fase werkende, geteste code op en stop telkens voor review:

1. Projectopzet (Next.js + TS + Tailwind-tokens), datamodel (Prisma) + auth/multi-tenant + seed van de catalogus uit de CSV.
2. Foodcost-/margemotor als pure functie **met unit tests** (WEIGHT/PIECE, marge, Waakhond-herberekening).
3. Recipe Lab + versiebeheer + catalogus-picker (live foodcost/marge).
4. Server-side Intelligent Router + Chef Auguste met de tool-loop (`search_ingredients`, recept opslaan/aanpassen, HACCP, leverancier, navigeren) en zod-validatie van tool-input.
5. HACCP-compliancelaag (append-only, hash-chaining, audit trail, retentie).
6. Overige modules (Flavor Matcher, Supplier Portal, Factuur Scan/OCR, Recipe Library, Menu Matrix, Ingrediëntencatalogus) + volledige responsive UI.
7. E2e-tests (Playwright) over de demoflows.

Wees in alle demo's expliciet over wat live is en wat gesimuleerd. Houd geheimen in server-side env; commit nooit sleutels.
