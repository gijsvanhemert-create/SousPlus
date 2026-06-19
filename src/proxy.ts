import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next 16 proxy-conventie (opvolger van middleware). Edge-veilig:
// gebruikt alleen authConfig, geen Prisma/bcrypt.
export default NextAuth(authConfig).auth;

export const config = {
  // Beschermt alles behalve API-routes, statics en bestanden met extensie.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
