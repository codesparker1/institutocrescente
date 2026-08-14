import type { Role } from "@/generated/prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    role: Role;
    professorId: string | null;
    alunoId: string | null;
    deveTrocarSenha: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      professorId: string | null;
      alunoId: string | null;
      deveTrocarSenha: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role;
    professorId: string | null;
    alunoId: string | null;
    deveTrocarSenha: boolean;
  }
}
