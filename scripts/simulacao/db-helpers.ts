/**
 * Só para o que não tem caminho de UI: ler quem já está seedado, para saber com quem fazer login.
 * Tudo o resto (criar provas, configurar janela de matrícula, processar rematrícula, lançar
 * notas...) passa pelas Server Actions reais via Playwright — é esse o ponto da simulação.
 *
 * Mesmo padrão de scripts/e2e-workflow/db-helpers.ts: liga direto ao Postgres local via
 * DATABASE_URL de .env.local (nunca ao Neon — ver feedback_migracoes_local_batch_neon).
 */
import "dotenv/config";
import dotenv from "dotenv";
import { PrismaClient } from "../../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

dotenv.config({ path: ".env.local", override: true });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export const DEMO_PASSWORD = "Ispc@2026";

export interface CredencialAgente {
  papel: string;
  email: string;
}

export interface ContextoSimulacao {
  admin: CredencialAgente;
  secretaria: CredencialAgente;
  daac: CredencialAgente;
  professores: CredencialAgente[];
  alunos: CredencialAgente[];
}

/**
 * 10 alunos + 2 professores + as 3 contas de staff únicas — todos já seedados por prisma/seed.ts.
 * Reaproveitar os alunos seedados (em vez de criar novos via "Nova Matrícula") porque já têm
 * matrícula/inscrições/histórico coerentes; a simulação testa o que acontece a partir daí, não
 * repete a Fase 0 de admissão.
 */
export async function getContextoSimulacao(): Promise<ContextoSimulacao> {
  const [admin, secretaria, daac, professores, alunos] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { email: true } }),
    prisma.user.findFirstOrThrow({ where: { role: "SECRETARIA" }, select: { email: true } }),
    prisma.user.findFirstOrThrow({ where: { role: "DAAC" }, select: { email: true } }),
    prisma.user.findMany({ where: { role: "PROFESSOR" }, select: { email: true }, take: 2 }),
    prisma.user.findMany({ where: { role: "ALUNO", aluno: { status: "ATIVO" } }, select: { email: true }, take: 10 }),
  ]);

  if (professores.length < 2) throw new Error("Precisa de pelo menos 2 professores seedados — corre o seed primeiro.");
  if (alunos.length < 10) throw new Error("Precisa de pelo menos 10 alunos seedados — corre o seed primeiro.");

  const semEmail = (label: string) => {
    throw new Error(`Conta de ${label} sem email — corre o seed primeiro.`);
  };

  return {
    admin: { papel: "admin", email: admin.email ?? semEmail("admin") },
    secretaria: { papel: "secretaria", email: secretaria.email ?? semEmail("secretaria") },
    daac: { papel: "daac", email: daac.email ?? semEmail("daac") },
    professores: professores.map((p, i) => ({ papel: `professor-${i + 1}`, email: p.email ?? semEmail("professor") })),
    alunos: alunos.map((a, i) => ({ papel: `aluno-${i + 1}`, email: a.email ?? semEmail("aluno") })),
  };
}

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
