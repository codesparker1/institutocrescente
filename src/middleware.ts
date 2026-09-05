import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/dashboard",
  SECRETARIA: "/dashboard",
  PROFESSOR: "/professor",
  ALUNO: "/dashboard",
  DAAC: "/dashboard",
};

const RESTRICTED_PREFIXES: { prefix: string; roles: string[] }[] = [
  // DAAC entrou aqui a 2026-08-18 (esquecido no pedido original de aproveitamento/histórico/
  // documentos — sem isto nenhuma dessa funcionalidade era alcançável pelo DAAC). Vê a ficha do
  // aluno em modo leitura no financeiro (podeRegistarPagamento continua ADMIN/SECRETARIA só, ver
  // src/lib/permissions.ts) — a separação de domínio continua a viver aí, não aqui.
  { prefix: "/alunos", roles: ["ADMIN", "SECRETARIA", "DAAC"] },
  // Mais específicos primeiro — contas de staff e configuração financeira geral não são domínio
  // do DAAC, ao contrário do resto de /admin (currículo, cursos, turmas, emolumentos), que
  // podeGerirCurriculo já autoriza ao nível da Server Action (src/lib/permissions.ts).
  { prefix: "/admin/professores", roles: ["ADMIN"] },
  { prefix: "/admin/financeiro", roles: ["ADMIN"] },
  { prefix: "/admin/equipa", roles: ["ADMIN"] },
  // DEV gere o relógio simulado (2026-08-21) — sem isto o middleware redireciona DEV para
  // /dashboard, que por sua vez volta a redirecionar para /admin/relogio? Não — mas DEV não
  // está em /admin, e ROLE_HOME["DEV"] é undefined → fallback /dashboard. Loop evitado ao
  // autorizar DEV explicitamente aqui.
  { prefix: "/admin/relogio", roles: ["DEV"] },
  // Caixa de entrada de reclamações é a "página inicial" do DEV (dashboard/page.tsx redireciona
  // para lá) — sem esta linha DEV entra em loop /admin/reclamacoes ↔ /dashboard (achado em teste
  // Playwright 2026-08: ERR_TOO_MANY_REDIRECTS ao logar como DEV).
  { prefix: "/admin/reclamacoes", roles: ["ADMIN", "DEV"] },
  { prefix: "/admin", roles: ["ADMIN", "DAAC"] },
  { prefix: "/auditoria", roles: ["ADMIN"] },
  { prefix: "/professor", roles: ["ADMIN", "PROFESSOR"] },
  { prefix: "/notas", roles: ["ADMIN", "DAAC"] },
  { prefix: "/minhas-notas", roles: ["ALUNO"] },
  // §2026-09-04. /admin/finalistas e /professor/orientandos nao precisam de linha propria: caem
  // nos prefixos /admin e /professor acima.
  { prefix: "/finalista", roles: ["ALUNO"] },
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
    "/finalista/:path*",
    "/financeiro/:path*",
    "/conta/:path*",
    "/reclamacoes/:path*",
    "/trocar-senha",
  ],
};
