import { requireSession } from "@/server/tenant";
import { prisma } from "@/server/db";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const location = await prisma.location.findUnique({
    where: { id: session.user.locationId },
    select: { name: true },
  });

  return (
    <AppShell
      user={{
        name: session.user.name ?? "Chef",
        role: session.user.role,
        locationName: location?.name ?? "Locatie",
      }}
    >
      {children}
    </AppShell>
  );
}
