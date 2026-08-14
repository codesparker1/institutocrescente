import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/dashboard",
  SECRETARIA: "/dashboard",
  PROFESSOR: "/professor",
  ALUNO: "/dashboard",
};

const RESTRICTED_PREFIXES: { prefix: string; roles: string[] }[] = [
  { prefix: "/alunos", roles: ["ADMIN", "SECRETARIA"] },
  { prefix: "/admin", roles: ["ADMIN"] },
  { prefix: "/auditoria", roles: ["ADMIN"] },
  { prefix: "/professor", roles: ["ADMIN", "PROFESSOR"] },
  { prefix: "/notas", roles: ["ADMIN", "DAAC"] },
  { prefix: "/minhas-notas", roles: ["ALUNO"] },
  { prefix: "/financeiro", roles: ["ADMIN", "SECRETARIA", "ALUNO"] },
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isAuthenticated = Boolean(req.auth?.user);

  if (!isAuthenticated) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth?.user.deveTrocarSenha && pathname !== "/trocar-senha") {
    return NextResponse.redirect(new URL("/trocar-senha", req.nextUrl.origin));
  }

  const role = req.auth?.user.role;
  const restricted = RESTRICTED_PREFIXES.find((r) => pathname.startsWith(r.prefix));
  if (restricted && role && !restricted.roles.includes(role)) {
    return NextResponse.redirect(new URL(ROLE_HOME[role] ?? "/dashboard", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/alunos/:path*",
    "/notas/:path*",
    "/professor/:path*",
    "/admin/:path*",
    "/auditoria/:path*",
    "/horario/:path*",
    "/minhas-notas/:path*",
    "/financeiro/:path*",
    "/trocar-senha",
  ],
};
