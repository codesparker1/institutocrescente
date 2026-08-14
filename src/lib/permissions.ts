import "server-only";
import { auth } from "@/lib/auth";
import type { Session } from "next-auth";
import type { Role } from "@/generated/prisma/client";

/**
 * Capacidades, não hierarquia de papéis (MD §3): a divisão entre ADMIN e DAAC não é
 * "superior/inferior" — são domínios diferentes. Cada função aqui responde a UMA pergunta
 * de autorização, e os pontos de entrada (Server Actions) compõem-nas em vez de testar
 * `role` diretamente. Isto substitui os guards `requireAdmin`/`requireFinanceiro`/`requireDocente`
 * que estavam duplicados em `admin.ts`, `financeiro.ts` e `horario.ts`.
 */

export interface CapabilityUser {
  role: Role;
  professorId?: string | null;
}

interface Cadeira {
  professorId: string;
}

/**
 * DAAC lança qualquer nota, de qualquer cadeira, a qualquer momento — ignora `prazoAberto`,
 * o que é também o mecanismo de reabertura (§4.3): não há um fluxo separado de "reabrir prazo",
 * o DAAC simplesmente continua a poder agir depois do prazo fechar para o professor. PROFESSOR
 * só lança nas suas próprias disciplinas e só com o prazo aberto. ADMIN e SECRETARIA não lançam
 * notas — decisão deliberada do MD ("é a separação que dá integridade ao sistema").
 */
export function podeLancarNota(user: CapabilityUser, cadeira: Cadeira, prazoAberto = true): boolean {
  if (user.role === "DAAC") return true;
  if (user.role !== "PROFESSOR") return false;
  return cadeira.professorId === user.professorId && prazoAberto;
}

/**
 * Gestão de currículo (cursos, disciplinas, turmas, atribuição de cadeiras aos professores,
 * horário) é domínio do DAAC. ADMIN mantém-se com acesso enquanto não houver contas DAAC
 * criadas — decisão temporária, ver plano de implementação, Fase 1.
 */
export function podeGerirCurriculo(user: CapabilityUser): boolean {
  return user.role === "DAAC" || user.role === "ADMIN";
}

/** Domínio administrativo/financeiro: inscrição, matrícula, confirmação, registo de pagamentos. */
export function podeRegistarPagamento(user: CapabilityUser): boolean {
  return user.role === "ADMIN" || user.role === "SECRETARIA";
}

/** Marcação de presenças e criação de aulas — hoje aberto a quem lecciona ou administra o dia a dia. */
export function podeGerirFrequencia(user: CapabilityUser): boolean {
  return user.role === "ADMIN" || user.role === "SECRETARIA" || user.role === "PROFESSOR";
}

/** Exclusivo do ADMIN: criar/desativar contas de staff e configuração geral do sistema. */
export function podeGerirContas(user: CapabilityUser): boolean {
  return user.role === "ADMIN";
}

/** ADMIN vê tudo — mas em modo leitura sobre dados académicos e financeiros. */
export function podeVerTudo(user: CapabilityUser): boolean {
  return user.role === "ADMIN";
}

export type SessionComUser = Session;

async function requireSessao(): Promise<SessionComUser> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Sem permissão para esta ação.");
  }
  return session;
}

/** Lança em `requireSessao` e ainda valida a capacidade indicada; usar dentro de Server Actions. */
async function requireCapacidade(check: (user: CapabilityUser) => boolean): Promise<SessionComUser> {
  const session = await requireSessao();
  if (!check(session.user)) {
    throw new Error("Sem permissão para esta ação.");
  }
  return session;
}

export function requireGerirCurriculo(): Promise<SessionComUser> {
  return requireCapacidade(podeGerirCurriculo);
}

export function requireRegistarPagamento(): Promise<SessionComUser> {
  return requireCapacidade(podeRegistarPagamento);
}

export function requireGerirFrequencia(): Promise<SessionComUser> {
  return requireCapacidade(podeGerirFrequencia);
}

export function requireGerirContas(): Promise<SessionComUser> {
  return requireCapacidade(podeGerirContas);
}
