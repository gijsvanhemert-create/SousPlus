import { prisma } from "@/server/db";
import { getVersionCostMap } from "@/server/recipe-cost-graph";
import { getOpenAlerts } from "@/server/watchdog";
import { isVersionPriceComplete, type VersionCost } from "@/lib/component-cost";
import { FLAVOR_DB } from "@/lib/flavor-data";
import { getRouter } from "./router";
import { llmConfig } from "./config";
import { TOOL_SCHEMAS, TOOL_BY_NAME, type ChefAction, type ToolContext } from "./tools";
import { runToolLoop, type Validation } from "./loop";
import type { LlmMessage, SystemBlock } from "./types";

// Chef Auguste: bouwt de live APP-CONTEXT, draait de tool-loop via de router en
// bewaart de conversatie in de database zodat ze behouden blijft bij navigeren en
// herladen (verbeterpunt t.o.v. het prototype: state buiten de component).

// --- APP-CONTEXT -------------------------------------------------------------

// Structurele types (los van Prisma) zodat de mapping puur en testbaar is.
type DecimalLike = { toString(): string };
type CtxIngredient = { name: string; amount: DecimalLike; unit: string; mode: string; pricePerUnit: DecimalLike | null };
type CtxActiveVersion = { id: string; label: string; name: string; ingredients: CtxIngredient[] };
export type CtxRecipe = {
  id: string;
  dish: string;
  category: string;
  menuPrice: DecimalLike;
  popularity: number;
  activeVersion: CtxActiveVersion | null;
  versions: { id: string; label: string; name: string }[];
};

// Zet database-recepten om naar de APP-CONTEXT die Chef Auguste ziet. Cruciaal:
// we geven de ECHTE id's mee (recipeId, activeVersion.id, en per versie een id +
// label). Zonder die id's kan het model update_recipe_version / save_recipe_version
// niet gericht aanroepen en gokt het een id dat nooit matcht → "versie niet
// gevonden". Alles is al op locationId gefilterd door de query hierboven.
export function buildMenuContext(recipes: CtxRecipe[], costByVersion: Map<string, VersionCost>) {
  return recipes.map((r) => {
    const v = r.activeVersion;
    // Foodcost/portie uit dezelfde resolver als Lab/Library (incl. componenten),
    // zodat Auguste nooit afwijkende cijfers noemt. Marge alleen bij een positieve
    // menuprijs (sub-recepten kunnen €0 zijn).
    // Cruciaal: is de kostprijs ONVOLLEDIG (een ingrediënt/component zonder prijs),
    // dan geven we GEEN (partieel) getal door — foodcost én marge worden null, zodat
    // Auguste nooit een schijnbaar-precies percentage over alleen de bekende
    // ingrediënten kan tonen. `foodcostPerServing` uit de map is dan bewust genegeerd.
    const foodcostComplete = v ? isVersionPriceComplete(costByVersion, v.id) : true;
    const foodcost = v && foodcostComplete ? costByVersion.get(v.id)?.foodcostPerServing ?? null : null;
    const price = Number(r.menuPrice);
    const fc = foodcost ? foodcost.toNumber() : null;
    return {
      recipeId: r.id,
      dish: r.dish,
      category: r.category,
      menuPrice: price,
      popularity: r.popularity,
      // false = één of meer ingrediënten zonder prijs → marge/foodcost NIET bepaalbaar.
      foodcostComplete,
      marginPct: fc !== null && price > 0 ? Number((((price - fc) / price) * 100).toFixed(1)) : null,
      foodcostPerCover: fc !== null ? Number(fc.toFixed(2)) : null,
      activeVersion: v ? { id: v.id, label: v.label, name: v.name } : null,
      // Alle versies met id + label, zodat update_recipe_version het juiste
      // versie-id kan meekrijgen (id = versie-id).
      versions: r.versions.map((ver) => ({ id: ver.id, label: ver.label, name: ver.name })),
      ingredients:
        v?.ingredients.map((i) => ({
          name: i.name,
          perCover: `${i.amount}${i.unit}`,
          // null = prijs onbekend (nog niet in de catalogus) — nooit als 0 tonen.
          pricePerUnit: i.pricePerUnit == null ? null : Number(i.pricePerUnit),
        })) ?? [],
    };
  });
}

// Sub-recepten (componentOnly) horen NIET in `menu` — ze zijn geen los verkoopbaar
// gerecht en mogen dus nooit in een menu- of margeanalyse meetellen. Toch moet
// Auguste weten dát ze bestaan (met hun echte id's) om ze op verzoek te kunnen
// bewerken. Daarom een aparte lijst met alleen naam + id's + waar ze gebruikt
// worden — bewust GEEN menuPrice/marge, zodat het model ze niet als gerecht ziet.
export type CtxComponent = {
  id: string;
  dish: string;
  category: string;
  // steps = de bereidingswijze van de actieve versie. Nodig om een component op
  // verzoek te kunnen bewerken (bv. een kop toevoegen): zonder de huidige stappen
  // zou het model ze moeten verzinnen, wat het (terecht) weigert.
  activeVersion: { id: string; label: string; name: string; steps: string[] } | null;
  versions: { id: string; label: string; name: string }[];
  usedIn: string[]; // gerechten waarin dit component gebruikt wordt
};

export function buildComponentContext(components: CtxComponent[]) {
  return components.map((c) => ({
    recipeId: c.id,
    dish: c.dish,
    category: c.category,
    // Expliciet gelabeld: dit is een sub-recept, geen los verkoopbaar gerecht.
    isComponent: true,
    usedIn: c.usedIn,
    activeVersion: c.activeVersion
      ? { id: c.activeVersion.id, label: c.activeVersion.label, name: c.activeVersion.name, steps: c.activeVersion.steps }
      : null,
    versions: c.versions.map((ver) => ({ id: ver.id, label: ver.label, name: ver.name })),
  }));
}

export async function buildContext(locationId: string) {
  const [recipes, components, catalogCount, checkpoints, costMap, alerts] = await Promise.all([
    prisma.recipe.findMany({
      // Sub-recepten (alleen-component) horen niet in het menu-overzicht dat
      // Auguste ziet; ze zijn alleen relevant als component van een gerecht.
      where: { locationId, componentOnly: false },
      include: {
        activeVersion: { include: { ingredients: true } },
        versions: { select: { id: true, label: true, name: true }, orderBy: { createdAt: "asc" } },
      },
      orderBy: [{ favorite: "desc" }, { dish: "asc" }],
    }),
    prisma.recipe.findMany({
      // De sub-recepten die uit `menu` worden gefilterd. Auguste moet ze wél kennen
      // (naam + id's) om ze op expliciet verzoek te kunnen bewerken; ze komen in een
      // apart `components`-blok en NOOIT in de margeanalyse.
      where: { locationId, componentOnly: true },
      include: {
        activeVersion: { select: { id: true, label: true, name: true, steps: true } },
        versions: { select: { id: true, label: true, name: true }, orderBy: { createdAt: "asc" } },
        // Omgekeerde relatie: in welke gerechten wordt dit component gebruikt?
        usedAsComponent: { select: { parentVersion: { select: { recipe: { select: { dish: true } } } } } },
      },
      orderBy: [{ dish: "asc" }],
    }),
    prisma.catalogItem.count({ where: { locationId } }),
    prisma.haccpCheckpoint.findMany({
      where: { locationId, active: true },
      select: { zone: true, target: true },
    }),
    // Component-inclusieve kosten voor de HELE locatie (ook de versies van
    // componenten, die niet in het gefilterde menu zitten).
    getVersionCostMap(locationId),
    // Openstaande Marge-Waakhond-alerts: zo weet Auguste welk gerecht/ingrediënt
    // onder druk staat én heeft hij het alertId om resolve_margin_alert te kunnen
    // aanroepen wanneer de gebruiker om advies vraagt.
    getOpenAlerts(locationId),
  ]);

  return {
    location: locationId,
    catalogSize: catalogCount,
    haccp: checkpoints,
    menu: buildMenuContext(recipes, costMap),
    components: buildComponentContext(
      components.map((c) => ({
        id: c.id,
        dish: c.dish,
        category: c.category,
        activeVersion: c.activeVersion,
        versions: c.versions,
        // Dedupliceer: eenzelfde ouder kan het component in meerdere versies gebruiken.
        usedIn: [...new Set(c.usedAsComponent.map((u) => u.parentVersion.recipe.dish))],
      })),
    ),
    flavor: buildFlavorContext(),
    alerts,
  };
}

// De GECUREERDE affinity-set (bron van waarheid voor exacte scores). Bewust
// beperkt: alleen deze basisingrediënten hebben een affinity-score uit onze data.
// Voor al het andere leunt Chef Auguste op zijn eigen culinaire kennis (expliciet
// als inzicht, niet als score). De bredere Foodpairing®-koppeling volgt in fase 2;
// dit verandert alleen wat Auguste in het gesprek mag zeggen, niet de Flavor
// Matcher-module zelf.
export function buildFlavorContext() {
  return {
    note:
      "Gecureerde affinity-set (beperkt). Alleen curatedIngredients hebben een geverifieerde affinity-score uit onze data; voor al het overige gebruik je je eigen culinaire kennis als inzicht, nooit als exacte score.",
    curatedIngredients: Object.keys(FLAVOR_DB),
    pairings: FLAVOR_DB,
  };
}

// Stabiel deel van de system-prompt: persona + gedragsregels + tool-uitleg. Dit
// verandert nooit binnen een deploy en krijgt daarom het prompt-cache-breakpoint
// (samen met de — eveneens stabiele — tool-schema's die er in de cache-prefix aan
// voorafgaan). Het dynamische APP-CONTEXT-blok volgt er ongecachet achteraan.
const CHEF_SYSTEM_STABLE =
  "Je bent Chef Auguste, de digitale sous-chef de cuisine binnen SousPlus+, een premium platform voor professionele keukens. " +
    "Je spreekt Nederlands. Je bent GEEN chatbot: je spreekt als een doorgewinterde brigade-souschef op Michelin-niveau — beslist, precies, warm maar met gezag, met natuurlijk gebruik van culinair-Franse vaktermen. " +
    "Houd je proza kort, als een mondelinge briefing aan de pas (meestal 2 tot 5 zinnen; alleen langer bij een echte analyse). " +
    "Opmaak: schrijf in gewone, rustige tekst en gebruik markdown spaarzaam — geen wirwar van sterretjes en losse bullets door je zinnen heen. Wanneer je een berekening, kostenopbouw of reeks cijfers toont, zet je die overzichtelijk regel-voor-regel onder elkaar als een bonnetje (één post per regel, met het bedrag aan het eind van de regel), zodat het in één oogopslag leesbaar is — geen dichte alinea vol getallen. Hooguit lichte nadruk waar het echt helpt. " +
    "Baseer alles op de meegeleverde APP-CONTEXT (echte recepturen, prijzen, marges, HACCP). Citeer concrete getallen waar relevant; verzin geen cijfers die niet kloppen met de context. " +
    "Gebruik de beschikbare tools om acties echt uit te voeren wanneer de chef daarom vraagt (recept opslaan of aanpassen, HACCP klaarzetten of invullen, leverancier wisselen, navigeren). Beschrijf kort in je proza wat je doet; de tool voert het uit. Voer geen actie uit als er alleen om advies of analyse wordt gevraagd. " +
    "Wanneer een vraag of opdracht over concrete ingrediënten, prijzen of een nieuwe receptuur gaat, gebruik je EERST search_ingredients om echte artikelen en prijzen uit de Hanos/Sligro-catalogus op te halen, en pas daarna reken of stel je voor — verzin geen prijzen. Sla een recept dat je voorstelt ook echt op met save_recipe_version, met de gevonden prijzen als p (prijs per kg/L) en de hoeveelheid als g (gram per couvert). " +
    "Ongeprijsde ingrediënten: staat een ingrediënt dat je wilt voorstellen écht niet in de catalogus (search_ingredients geeft geen bruikbare treffer), dan LAAT JE p WEG bij dat ingrediënt in plaats van een prijs te verzinnen of 0 in te vullen — de prijs geldt dan als 'onbekend'. Meld dit proactief en expliciet in je proza (bijvoorbeeld: 'let op: [ingrediënt] staat nog niet in onze catalogus, de kostprijs is dus onbekend tot je 'm invult in de Recipe Lab'). " +
    "ABSOLUUT VERBOD bij een onvolledig geprijsd recept: noem dan GEEN margepercentage en GEEN foodcost-bedrag — ook niet als 'voorlopig', 'onvolledig', 'circa', of berekend over enkel de bekende ingrediënten. Reken zo'n getal ook NIET zelf uit in je antwoordtekst. Zeg puur in woorden dat de marge en foodcost nog niet te bepalen zijn zolang de ontbrekende prijs niet is ingevuld — presenteer geen enkel getal dat de indruk van precisie wekt. Je herkent een onvolledig recept aan foodcostComplete: false en/of marginPct: null bij het gerecht in de APP-CONTEXT, aan pricePerUnit: null bij een ingrediënt, en aan de 'LET OP … prijs onbekend'-melding die een tool teruggeeft na het opslaan. " +
    "Elk gerecht in de APP-CONTEXT heeft een recipeId, een activeVersion met een id, en een lijst versions met per versie een id + label. Gebruik ALTIJD deze echte id's uit de context — verzin of gok NOOIT een id. Voor update_recipe_version geef je id = het versie-id mee (meestal activeVersion.id, of het bijpassende id uit versions). Voor een nieuwe versie van een BESTAAND recept geef je recipeId mee aan save_recipe_version. " +
    "Componenten/sub-recepten: als er expliciet om een component of sub-recept (bv. een saus) VOOR een bestaand gerecht wordt gevraagd, maak je het recept met save_recipe_version en geef je asComponentOf.parentRecipeId mee (= recipeId van het ouderrecept) — dan wordt het meteen gekoppeld. Bestaat het te koppelen recept al, gebruik dan link_component met parentRecipeId + childRecipeId in plaats van een nieuw recept te maken. Koppelen vraagt eerst een bevestiging; als het koppelen faalt (bijvoorbeeld door de cyclus- of dieptecheck), meld dat dan eerlijk en doe niet alsof het gelukt is. " +
    "Naast 'menu' bevat de APP-CONTEXT een aparte lijst 'components': dit zijn sub-recepten/componenten (elk met recipeId, activeVersion.id, versions[].id en usedIn = de gerechten waarin ze worden gebruikt). Het zijn GEEN los verkoopbare gerechten: neem ze NOOIT mee in een menu- of margeanalyse en stel ze niet voor als zelfstandig menu-item. Vraagt de chef expliciet om een component te bewerken (bijvoorbeeld de bereidingsstappen of de naam), dan mag dat wél: gebruik update_recipe_version met een id uit 'components' (activeVersion.id, of het juiste versions[].id) — verzin of gok ook hier nooit een id. " +
    "Als een tool een fout teruggeeft, presenteer je het resultaat NOOIT alsof het gelukt is: meld eerlijk en beknopt dat het niet lukte. Cijfers als marge en foodcost baseer je uitsluitend op de APP-CONTEXT (huidige staat); een uitkomst ná een wijziging die niet is opgeslagen noem je expliciet 'verwacht/na aanpassing', nooit als vaststaand feit. " +
    "Marge-Waakhond: de APP-CONTEXT bevat onder 'alerts' de openstaande marge-waarschuwingen (elk met id, ingredient, dish, affectedRecipeId, deltaPct, currentMarginPct). Vraagt de gebruiker om mee te denken over zo'n alert, geef dan NIET klakkeloos 'wissel van leverancier', maar draag 2 à 3 concrete, onderbouwde opties aan — bijvoorbeeld een goedkoper alternatief of substituut-ingrediënt (gebruik search_ingredients voor échte catalogusprijzen), een aangepaste portie, een menuprijs­aanpassing, of een combinatie — met per optie het effect op de marge. Voer een gekozen aanpak zelf uit via de juiste tool (switch_supplier, of update_recipe_version voor portie/menuprijs) en sluit de alert daarna af met resolve_margin_alert (alertId uit de context + een korte omschrijving van de aanpak). Sluit een alert nooit ongevraagd: doe het pas als de gebruiker een richting heeft gekozen. " +
    "Bij vragen over smaakcombinaties/pairings: de APP-CONTEXT bevat onder 'flavor' een GECUREERDE affinity-set (flavor.curatedIngredients + flavor.pairings), nu beperkt tot enkele basisingrediënten. Zit het gevraagde ingrediënt in die set, dan mag je een concrete match presenteren als 'affinity-score X uit onze data'. Zit het ingrediënt of de combinatie er NIET in (bv. eendenlever, miso als basis, en de meeste andere), zeg dan NOOIT dat je het niet weet en verzin NOOIT een exacte score: gebruik je eigen brede culinaire kennis als AI om onderbouwd te adviseren — welke smaken, texturen en bereidingen samengaan en waarom — en frame dat expliciet als culinair inzicht ('op basis van culinaire ervaring'), niet als een geverifieerd datapunt. Maak het onderscheid tussen beide bronnen in je antwoord altijd duidelijk. De gecureerde set is een tussenstap; de bredere Foodpairing®-koppeling volgt in fase 2. ";

// Bouwt de volledige system-prompt als twee blokken: het stabiele deel met een
// cache-breakpoint, gevolgd door het dynamische APP-CONTEXT-blok (ongecachet).
export function buildSystem(context: unknown): SystemBlock[] {
  return [
    { text: CHEF_SYSTEM_STABLE, cache: true },
    { text: "APP-CONTEXT (JSON):\n" + JSON.stringify(context) },
  ];
}

// --- Conversatiepersistentie -------------------------------------------------

async function resolveConversation(locationId: string, userId: string, conversationId?: string) {
  if (conversationId) {
    const conv = await prisma.chefConversation.findFirst({
      where: { id: conversationId, locationId, userId },
      select: { id: true },
    });
    if (conv) return conv.id;
  }
  const latest = await prisma.chefConversation.findFirst({
    where: { locationId, userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (latest) return latest.id;
  const created = await prisma.chefConversation.create({
    data: { locationId, userId },
    select: { id: true },
  });
  return created.id;
}

async function loadHistory(conversationId: string): Promise<LlmMessage[]> {
  const rows = await prisma.chefMessage.findMany({
    where: { conversationId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return rows.map((r) =>
    r.role === "USER"
      ? ({ role: "user", content: r.content } as LlmMessage)
      : ({ role: "assistant", content: [{ type: "text", text: r.content }] } as LlmMessage),
  );
}

// --- Publieke API ------------------------------------------------------------

export type ChefTurnResult = {
  conversationId: string;
  text: string;
  actions: ChefAction[];
  navigateTo?: string;
  pendingConfirmation?: { tool: string; summary: string };
};

export async function runChefTurn(params: {
  locationId: string;
  userId: string;
  message: string;
  conversationId?: string;
  autoConfirm?: boolean;
  /** Optioneel: ontvang tekst-deltas terwijl het model genereert (streaming). */
  onText?: (delta: string) => void;
}): Promise<ChefTurnResult> {
  const ctx: ToolContext = { locationId: params.locationId, userId: params.userId };
  // Diagnose-timing (alleen actief met CHEF_TIMING=1) om te zien waar de tijd
  // heen gaat: DB/context-opbouw vs. de LLM-round-trips in de tool-loop.
  const timing = process.env.CHEF_TIMING === "1";
  const t0 = performance.now();

  const conversationId = await resolveConversation(params.locationId, params.userId, params.conversationId);
  const history = await loadHistory(conversationId);
  const messages: LlmMessage[] = [...history, { role: "user", content: params.message }];
  const tHistory = performance.now();

  const system = buildSystem(await buildContext(params.locationId));
  const tContext = performance.now();
  const router = getRouter();

  let rounds = 0;
  const result = await runToolLoop(messages, {
    autoConfirm: params.autoConfirm ?? false,
    call: ({ messages: m, toolChoiceNone }) => {
      rounds += 1;
      const req = { system, messages: m, tools: TOOL_SCHEMAS, toolChoiceNone, maxTokens: llmConfig.maxTokens };
      if (params.onText) {
        // Scheid opeenvolgende rondes (bv. "ik zoek…" gevolgd door het antwoord).
        if (rounds > 1) params.onText("\n\n");
        return router.runStream("tier2", req, { locationId: params.locationId, action: "chef" }, params.onText);
      }
      return router.run("tier2", req, { locationId: params.locationId, action: "chef" });
    },
    validate: (name, input): Validation => {
      const tool = TOOL_BY_NAME.get(name);
      if (!tool) return { ok: false, error: `onbekende tool ${name}` };
      const parsed = tool.zod.safeParse(input);
      return parsed.success
        ? { ok: true }
        : { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
    },
    requiresConfirm: (name, input) => {
      const tool = TOOL_BY_NAME.get(name);
      if (!tool) return false;
      // Sommige tools bevestigen alleen bij bepaalde input (bv. save_recipe_version
      // wanneer het ook als component koppelt).
      return tool.confirmFor ? tool.confirmFor(input) : tool.confirm;
    },
    execute: async (name, input) => {
      const tool = TOOL_BY_NAME.get(name);
      if (!tool) throw new Error(`onbekende tool ${name}`);
      return tool.execute(input, ctx);
    },
  });

  if (timing) {
    const now = performance.now();
    console.log(
      JSON.stringify({
        at: "chef.timing",
        historyMs: Math.round(tHistory - t0),
        buildContextMs: Math.round(tContext - tHistory),
        loopMs: Math.round(now - tContext),
        totalMs: Math.round(now - t0),
        rounds,
        message: params.message.slice(0, 48),
      }),
    );
  }

  // Op bevestiging wachten: niets persisteren — de client herhaalt de opdracht
  // met autoConfirm zodra de chef akkoord geeft.
  if (result.pendingConfirmation) {
    return {
      conversationId,
      text: result.text,
      actions: result.actions,
      navigateTo: result.navigateTo,
      pendingConfirmation: { tool: result.pendingConfirmation.tool, summary: result.pendingConfirmation.summary },
    };
  }

  await prisma.$transaction([
    prisma.chefMessage.create({ data: { conversationId, role: "USER", content: params.message } }),
    prisma.chefMessage.create({ data: { conversationId, role: "ASSISTANT", content: result.text } }),
  ]);

  return {
    conversationId,
    text: result.text,
    actions: result.actions,
    navigateTo: result.navigateTo,
  };
}

export type ChefHistory = { conversationId: string | null; messages: { role: "user" | "assistant"; text: string }[] };

export async function getChefHistory(locationId: string, userId: string): Promise<ChefHistory> {
  const conv = await prisma.chefConversation.findFirst({
    where: { locationId, userId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!conv) return { conversationId: null, messages: [] };
  const rows = await prisma.chefMessage.findMany({
    where: { conversationId: conv.id, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  return {
    conversationId: conv.id,
    messages: rows.map((r) => ({ role: r.role === "USER" ? "user" : "assistant", text: r.content })),
  };
}
