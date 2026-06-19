import { z } from "zod";
import { getTenant } from "@/server/tenant";
import { runChefTurn, getChefHistory } from "@/server/llm/chef";
import { RateLimitError } from "@/server/llm/router";

// Server-side endpoint voor Chef Auguste. Het LLM wordt uitsluitend hier
// aangeroepen; de API-sleutel staat nooit in client-code.

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  // De client stuurt null wanneer er nog geen conversatie is.
  conversationId: z.string().nullish(),
  autoConfirm: z.boolean().nullish(),
});

export async function POST(request: Request) {
  let tenant;
  try {
    tenant = await getTenant();
  } catch {
    return Response.json({ error: "Niet ingelogd." }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Ongeldige invoer." }, { status: 400 });
  }

  try {
    const result = await runChefTurn({
      locationId: tenant.locationId,
      userId: tenant.userId,
      message: body.message,
      conversationId: body.conversationId ?? undefined,
      autoConfirm: body.autoConfirm ?? undefined,
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof RateLimitError) {
      return Response.json({ error: e.message }, { status: 429 });
    }
    console.error("chef turn error", e);
    return Response.json({ error: "De lijn met de keuken hapert even — geef me zo opnieuw de opdracht." }, { status: 500 });
  }
}

export async function GET() {
  let tenant;
  try {
    tenant = await getTenant();
  } catch {
    return Response.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  const history = await getChefHistory(tenant.locationId, tenant.userId);
  return Response.json(history);
}
