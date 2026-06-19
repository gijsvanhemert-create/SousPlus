# SousPlus+ Premium

B2B-SaaS "digitale sous-chef" voor professionele keukens — de productieversie van
de prototype-MVP (`docs/reference/SousPlusPremiumApp.jsx`, de bron van waarheid).
Eén responsieve codebase; alle LLM-calls lopen server-side via een model-agnostische
Intelligent Router; HACCP is compliance (append-only, tamper-evident), geen checklist.

## Modules

- **AI Sous-Chef "Chef Auguste"** — server-side tool-loop (zoeken, recept opslaan/
  aanpassen, HACCP, leverancier wisselen, navigeren) met zod-validatie van elke
  tool-input en bevestiging bij overschrijvende acties; persistente conversatie.
- **Recipe Lab** — versiebeheer, portieschaler, Kitchen View en **live foodcost/
  marge** uit echte ingrediënt-math, met catalogus-picker.
- **Flavor Matcher** — affinity-scores met smaakfilters (gecureerde dataset).
- **Supplier Portal** — live inkoopprijzen + gesimuleerde re-sync die de marges
  live laat meebewegen (prijshistorie via `IngredientPrice`).
- **Factuur Scan (OCR)** — server-side Tier 1-extractie → koppeling aan de
  catalogus → voorraadprijzen bijwerken.
- **HACCP-light** — dagstaat met automatische norm-check en een **append-only,
  hash-chained audit trail** (manipulatiedetectie + retentie).
- **Recipe Library** — menukaart-grid met live marge; opent recepten in de Lab.
- **Menu Matrix** — Boston-grid (populariteit × marge) met advies per kwadrant.
- **Ingrediëntencatalogus** — doorzoekbaar/filterbaar over 417 seed-artikelen.
- **Marge-Waakhond** — globale bel die bij een margebedreiging (na een prijs-
  cascade) een alert toont met twee herstelacties: *leverancier wisselen* /
  *prijs accepteren*.

## Stack

- **Next.js 16** (App Router, `src/proxy.ts` i.p.v. middleware) · React 19 ·
  **TypeScript** · **Tailwind CSS v4**
- **PostgreSQL + Prisma 7** (driver-adapter `@prisma/adapter-pg`)
- **Auth.js (NextAuth v5)** — credentials, multi-tenant (Organization → Location → User)
- **Anthropic TypeScript SDK** via de Intelligent Router (Tier 1 / Tier 2, model-agnostisch)
- **zod** voor input-/tool-validatie · **Zustand** voor client-state
- **decimal.js** voor geld (nooit floats) · **Vitest** (unit) · **Playwright** (e2e)

## Designtokens

Diep-groen / champagne-gold luxe minimalisme. Tokens staan als CSS-variabelen in
`src/app/globals.css` (`@theme`) en zijn beschikbaar als Tailwind-utilities
(`bg-forest`, `text-gold`, `border-line`, `font-serif`, …). Fonts: Fraunces + Inter.

## Zo draai je het

```bash
npm install

# 1. Configureer env
cp .env.example .env
#   - DATABASE_URL       : je Neon/Supabase EU-Postgres connection string
#   - AUTH_SECRET        : npx auth secret
#   - ANTHROPIC_API_KEY  : leeg laten = mock-adapter (draait volledig zonder API-calls)

# 2. Database-schema + seed
npm run db:push    # zet het schema in de DB (aanbevolen voor Supabase)
npm run db:seed    # demo-tenant, catalogus (417 art.), recepturen, HACCP-punten

# 3. Draaien
npm run dev        # http://localhost:3000  → redirect naar /login
```

> **Supabase + migraties:** `npm run db:migrate` (`prisma migrate dev`) maakt een
> shadow-database aan, wat via de pooler/`postgres`-rol niet mag. Gebruik op Supabase
> `npm run db:push`. Versiebeheerde migraties kunnen later met een directe
> connectie (`directUrl`) als shadow-DB.

### Demo-login

```
mark@bistroplus.nl / demo1234   (Executive Chef · Bistro+ Den Bosch)
owner@bistroplus.nl / demo1234  (Eigenaar)
chef@bistroplus.nl  / demo1234  (Chef de Partie)
```

## Tests

```bash
npm test            # Vitest unit-tests (kostenmotor, tool-loop, router, HACCP-hashketen)
npm run test:e2e    # Playwright e2e over de demoflows
```

De e2e-suite draait tegen de **productie-build** (`next build && next start`) en de
echte database. Een global-setup **reseedt** vooraf (zet `E2E_SKIP_SEED=1` om dit
over te slaan); de tests draaien serieel. Chromium installeren met
`npx playwright install chromium`.

> **Auth.js + productie/e2e:** in productie (`next start`) vertrouwt Auth.js de host
> niet automatisch — zet `AUTH_TRUST_HOST=true` (de Playwright-config doet dit al
> voor zijn eigen server). Op Vercel is dit niet nodig.

## Scripts

| Script               | Doel                                          |
| -------------------- | --------------------------------------------- |
| `npm run dev`        | Dev-server                                    |
| `npm run build`      | Productie-build                               |
| `npm run start`      | Productie-server (vereist build)              |
| `npm test`           | Vitest unit-tests                             |
| `npm run test:e2e`   | Playwright e2e (build + start + reseed)       |
| `npm run db:push`    | Schema pushen zonder migratie (Supabase)      |
| `npm run db:seed`    | Database seeden uit CSV + prototype-data      |
| `npm run db:studio`  | Prisma Studio                                 |
| `npm run lint`       | ESLint                                        |

## Projectstructuur

```
src/
  app/(app)/        beschermde modules: chef, lab, flavor, supplier, ocr,
                    haccp, library, matrix, ingredients (+ gedeelde layout/app-shell)
  app/(auth)/login  credentials-login
  app/api/          chef (tool-loop), alerts (Marge-Waakhond), auth
  server/           data-access + server-actions (locatie-gescopet):
                      db, tenant, recipes, catalog, menu, supplier(+switch),
                      ocr, watchdog, haccp/ (compliance + records), llm/ (router,
                      adapters, tools, tool-loop, Chef Auguste)
  lib/              cost (pure kostenmotor), format, nav, flavor-data,
                    chef-store / watchdog-store (Zustand)
  components/       UI (recipe-lab, chef-auguste, haccp-board, …)
  generated/prisma  Prisma-client output
prisma/             schema.prisma, seed.ts, seed/sousplus_ingredienten.csv
e2e/                Playwright config-setup + demo-flow specs
```

## Architectuurprincipes

- **LLM nooit vanuit de browser** — alle AI-calls lopen via `src/server/llm/`
  (Intelligent Router). De API-sleutel staat uitsluitend in server-side env.
  Zonder sleutel draait een deterministische mock-adapter.
- **Model-agnostisch** — modelnamen in env/config, Tier 1 (volume) en Tier 2
  (advies/tool-use), met Tier 1 response-caching, rate-limiting en logging.
- **Geld = Decimal** — de foodcost-/margemotor (`src/lib/cost.ts`) is een pure,
  los geteste functie; dezelfde motor voedt Lab, Library, Matrix en de Waakhond.
- **HACCP = compliance** — registraties zijn append-only en hash-chained; een
  wijziging in een oud record breekt de keten en wordt gedetecteerd.
- **Multi-tenant** — elke query/actie is gescopet op `locationId` (geen IDOR).

## Wat is live vs. gesimuleerd

In de demo zijn de **supplier-feeds** (re-sync), de **OCR** (tekst-paste i.p.v.
beeld/PDF) en de **volledige assortimentskoppeling** gesimuleerd; de UI labelt dit
expliciet en de architectuur is voorbereid op echte feed-/OCR-adapters. Geheimen
staan uitsluitend in server-side env en worden nooit gecommit.

## Bouwfasen

| Fase | Inhoud                                                              | Status   |
| ---- | ------------------------------------------------------------------ | -------- |
| 1    | Projectopzet, datamodel, auth/multi-tenant, CSV-seed               | ✅ klaar |
| 2    | Foodcost-/margemotor als pure functie + unit tests                 | ✅ klaar |
| 3    | Recipe Lab + versiebeheer + catalogus-picker (live foodcost/marge) | ✅ klaar |
| 4    | Intelligent Router + Chef Auguste tool-loop (zod-validatie)        | ✅ klaar |
| 5    | HACCP-compliancelaag (append-only, hash-chaining, audit, retentie) | ✅ klaar |
| 6    | Overige modules + volledige responsive UI                          | ✅ klaar |
| 7    | Playwright e2e over de demoflows                                   | ✅ klaar |
| +    | Marge-Waakhond (globaal: bel + alerts + herstelacties)             | ✅ klaar |
