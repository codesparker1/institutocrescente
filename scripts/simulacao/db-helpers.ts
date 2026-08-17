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

function amostraAleatoria<T>(items: T[], quantidade: number): T[] {
  const copia = [...items];
  for (let i = copia.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, quantidade);
}

/**
 * `professores`/`alunos` escolhem quantas contas de cada papel devolver (omitido = 2/10, o
 * suficiente para run-pequeno.ts). Contra a seed grande (100 professores / 1000 alunos), a
 * amostra é aleatória em vez de "os primeiros N" — para não bater sempre nas mesmas contas em
 * corridas repetidas. Reaproveitar contas seedadas (em vez de criar novas via "Nova Matrícula")
 * porque já têm matrícula/inscrições/histórico coerentes; a simulação testa o que acontece a
 * partir daí, não repete a Fase 0 de admissão.
 */
export async function getContextoSimulacao(opts: { professores?: number; alunos?: number } = {}): Promise<ContextoSimulacao> {
  const { professores: nProfessores = 2, alunos: nAlunos = 10 } = opts;
  const [admin, secretaria, daac, todosProfessores, todosAlunos] = await Promise.all([
    prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { email: true } }),
    prisma.user.findFirstOrThrow({ where: { role: "SECRETARIA" }, select: { email: true } }),
    prisma.user.findFirstOrThrow({ where: { role: "DAAC" }, select: { email: true } }),
    prisma.user.findMany({ where: { role: "PROFESSOR" }, select: { email: true } }),
    prisma.user.findMany({ where: { role: "ALUNO", aluno: { status: "ATIVO" } }, select: { email: true } }),
  ]);

  if (todosProfessores.length < nProfessores) throw new Error(`Precisa de pelo menos ${nProfessores} professores seedados — corre o seed primeiro.`);
  if (todosAlunos.length < nAlunos) throw new Error(`Precisa de pelo menos ${nAlunos} alunos seedados — corre o seed primeiro.`);

  const professores = amostraAleatoria(todosProfessores, nProfessores);
  const alunos = amostraAleatoria(todosAlunos, nAlunos);

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
