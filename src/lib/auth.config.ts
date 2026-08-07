import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.professorId = user.professorId;
        token.alunoId = user.alunoId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role;
      session.user.professorId = token.professorId;
      session.user.alunoId = token.alunoId;
      return session;
    },
  },
} satisfies NextAuthConfig;
