import type { NextAuthConfig } from "next-auth";

// Edge-veilige basisconfig (geen Prisma/bcrypt) — gebruikt in middleware.
// De Credentials-provider zit in auth.ts (Node-runtime).
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isAuthPage = nextUrl.pathname.startsWith("/login");

      if (isAuthPage) {
        if (isLoggedIn) return Response.redirect(new URL("/chef", nextUrl));
        return true;
      }
      // Alle overige (app-)routes vereisen een sessie.
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
        token.locationId = user.locationId;
        token.orgId = user.orgId;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.locationId = token.locationId;
        session.user.orgId = token.orgId;
        session.user.role = token.role;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
