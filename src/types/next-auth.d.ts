import type { DefaultSession } from "next-auth";
import type { Role } from "@/generated/prisma/enums";

// Verrijk de sessie/token met multi-tenant velden.
declare module "next-auth" {
  interface User {
    locationId: string;
    orgId: string;
    role: Role;
  }

  interface Session {
    user: {
      id: string;
      locationId: string;
      orgId: string;
      role: Role;
    } & DefaultSession["user"];
  }
}

// JWT-interface woont in @auth/core/jwt (next-auth/jwt her-exporteert die).
declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    locationId: string;
    orgId: string;
    role: Role;
  }
}
