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

  // Streaming respons (NDJSON, één JSON-object per regel):
  //   {"type":"delta","text":"…"}   — herhaald, tijdens het genereren
  //   {"type":"done", …}            — afsluitend, met actions/navigateTo/pending/error
  const t = tenant;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        const result = await runChefTurn({
          locationId: t.locationId,
          userId: t.userId,
          message: body.message,
          conversationId: body.conversationId ?? undefined,
          autoConfirm: body.autoConfirm ?? undefined,
          onText: (delta) => send({ type: "delta", text: delta }),
        });
        send({
          type: "done",
          conversationId: result.conversationId,
          text: result.text,
          actions: result.actions,
          navigateTo: result.navigateTo,
          pendingConfirmation: result.pendingConfirmation,
        });
      } catch (e) {
        if (e instanceof RateLimitError) {
          send({ type: "done", error: e.message });
        } else {
          console.error("chef turn error", e);
          send({ type: "done", error: "De lijn met de keuken hapert even — geef me zo opnieuw de opdracht." });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
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
