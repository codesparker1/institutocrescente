import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/lib/auth.config";

/** Login aceita email OU número de estudante (MD §7) — os alunos podem não ter email. */
function pareceEmail(identificador: string): boolean {
  return identificador.includes("@");
}

export function buscarUserPorIdentificador(identificador: string) {
  return pareceEmail(identificador)
    ? prisma.user.findUnique({ where: { email: identificador } })
    : prisma.user.findUnique({ where: { numeroEstudante: identificador } });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identificador: { label: "Email ou nº de estudante", type: "text" },
        password: { label: "Senha", type: "password" },
      },
      authorize: async (credentials) => {
        const identificador = credentials?.identificador;
        const password = credentials?.password;
        if (typeof identificador !== "string" || typeof password !== "string") return null;

        const user = await buscarUserPorIdentificador(identificador);
        if (!user) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          professorId: user.professorId,
          alunoId: user.alunoId,
          deveTrocarSenha: user.deveTrocarSenha,
        };
      },
    }),
  ],
});
