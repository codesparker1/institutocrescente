import type { NextAuthConfig, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

export const authConfig: NextAuthConfig = {
  // Vercel confia no host automaticamente; fora do Vercel (`next start` puro — runner do GitHub
  // Actions, Docker, etc.) o Auth.js v5 rejeita o callback de login com 500 (UntrustedHost) sem
  // isto. Descoberto pela corrida do cost-meter: login falhava sempre sob `next start` em CI,
  // apesar de funcionar sempre em `next dev` local — a diferença exata que este exercício existe
  // para apanhar.
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        token.role = user.role;
        token.professorId = user.professorId;
        token.alunoId = user.alunoId;
        token.deveTrocarSenha = user.deveTrocarSenha;
      }
      return token;
    },
    session({ session, token }: { session: Session; token: JWT }) {
      session.user.id = token.sub as string;
      session.user.role = token.role;
      session.user.professorId = token.professorId;
      session.user.alunoId = token.alunoId;
      session.user.deveTrocarSenha = token.deveTrocarSenha;
      return session;
    },
  },
};
