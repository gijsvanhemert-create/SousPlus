import { auth } from "@/auth";

/**
 * Haalt de huidige sessie op en garandeert dat er een ingelogde gebruiker is.
 * Alle data-access op locatie-niveau scopt op session.user.locationId.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Geen actieve sessie.");
  }
  return session;
}

export type TenantContext = {
  userId: string;
  locationId: string;
  orgId: string;
  role: string;
  name?: string | null;
};

export async function getTenant(): Promise<TenantContext> {
  const session = await requireSession();
  return {
    userId: session.user.id,
    locationId: session.user.locationId,
    orgId: session.user.orgId,
    role: session.user.role,
    name: session.user.name,
  };
}
