import type { NextAuthConfig } from "next-auth";

// Edge-safe config (no prisma/bcrypt) shared by middleware and src/auth.ts.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.stateId = user.stateId;
        token.stateName = user.stateName;
        token.stateCode = user.stateCode;
        token.districtId = user.districtId;
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as string;
        session.user.stateId = (token.stateId as string) ?? null;
        session.user.stateName = (token.stateName as string) ?? null;
        session.user.stateCode = (token.stateCode as string) ?? null;
        session.user.districtId = (token.districtId as string) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
