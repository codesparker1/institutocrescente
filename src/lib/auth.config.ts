import type { NextAuthConfig, Session, User } from "next-auth";
import type { JWT } from "next-auth/jwt";

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }: { token: JWT; user?: User }) {
      if (user) {
        token.role = user.role;
        token.professorId = user.professorId;
        token.alunoId = user.alunoId;
      }
      return token;
    },
    session({ session, token }: { session: Session; token: JWT }) {
      session.user.id = token.sub as string;
      session.user.role = token.role;
      session.user.professorId = token.professorId;
      session.user.alunoId = token.alunoId;
      return session;
    },
  },
};
