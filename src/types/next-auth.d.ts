import type { Role } from "@/generated/prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    professorId: string | null;
    alunoId: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      professorId: string | null;
      alunoId: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    professorId: string | null;
    alunoId: string | null;
  }
}
