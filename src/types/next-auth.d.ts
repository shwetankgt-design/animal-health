import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    stateId: string | null;
    stateName: string | null;
    stateCode: string | null;
    districtId: string | null;
  }
  interface Session {
    user: {
      id: string;
      role: string;
      stateId: string | null;
      stateName: string | null;
      stateCode: string | null;
      districtId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid: string;
    role: string;
    stateId: string | null;
    stateName: string | null;
    stateCode: string | null;
    districtId: string | null;
  }
}
