import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { state: true, district: true },
        });
        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          stateId: user.stateId,
          stateName: user.state?.name ?? null,
          stateCode: user.state?.code ?? null,
          districtId: user.districtId,
        };
      },
    }),
  ],
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
});
