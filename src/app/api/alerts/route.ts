import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getTenant } from "@/server/tenant";
import { getOpenAlerts, resolveAlert } from "@/server/watchdog";

// Marge-Waakhond endpoint: openstaande alerts ophalen + oplossen.

export async function GET() {
  let tenant;
  try {
    tenant = await getTenant();
  } catch {
    return Response.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  const alerts = await getOpenAlerts(tenant.locationId);
  return Response.json({ alerts });
}

const postSchema = z.object({ alertId: z.string().min(1), action: z.enum(["switch", "accept"]) });

export async function POST(request: Request) {
  let tenant;
  try {
    tenant = await getTenant();
  } catch {
    return Response.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "Ongeldige invoer." }, { status: 400 });
  }
  try {
    const res = await resolveAlert(tenant.locationId, body.alertId, body.action);
    // De herstelactie wijzigt prijzen/menuprijs → marges elders verversen.
    for (const path of ["/supplier", "/lab", "/library", "/matrix"]) revalidatePath(path);
    return Response.json(res);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
