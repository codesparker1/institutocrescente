"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/audit";
import { mesReferenciaLabel, getEstadoFinanceiroAluno, type EstadoFinanceiroAluno } from "@/lib/financeiro";

async function requireFinanceiro() {
  const session = await auth();
  if (!session?.user || !["ADMIN", "SECRETARIA"].includes(session.user.role)) {
    throw new Error("Sem permissão para esta ação.");
  }
  return session;
}

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Sem permissão para esta ação.");
  }
  return session;
}

function revalidarFinanceiro(alunoId: string) {
  revalidatePath("/financeiro/registo");
  revalidatePath("/financeiro/devedores");
  revalidatePath("/financeiro");
  revalidatePath(`/alunos/${alunoId}`);
  revalidatePath("/dashboard");
  revalidatePath("/minhas-notas");
  revalidatePath("/horario");
}

const TogglePropinaSchema = z.object({
  propinaId: z.string().min(1),
});

export async function togglePropinaAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireFinanceiro();
  const { propinaId } = TogglePropinaSchema.parse({
    propinaId: formData.get("propinaId"),
  });

  const propina = await prisma.propina.findUnique({
    where: { id: propinaId },
    include: { aluno: true },
  });
  if (!propina) throw new Error("Registo de propina não encontrado.");

  const outrosMeses = await prisma.propina.findMany({
    where: { alunoId: propina.alunoId, id: { not: propina.id } },
    orderBy: { mesReferencia: "asc" },
  });

  if (propina.status === "PENDENTE") {
    const mesAnteriorPorPagar = outrosMeses.find(
      (m) => m.mesReferencia < propina.mesReferencia && m.status === "PENDENTE",
    );
    if (mesAnteriorPorPagar) {
      return { error: `Tem de confirmar primeiro o pagamento de ${mesReferenciaLabel(mesAnteriorPorPagar.mesReferencia)}.` };
    }

    await prisma.propina.update({
      where: { id: propina.id },
      data: {
        status: "PAGO",
        valorPago: propina.valorDevido,
        dataPagamento: new Date(),
        registadoPorId: session.user.id,
      },
    });

    await registrarAuditoria({
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? "Utilizador",
      userRole: session.user.role,
      action: `Confirmou o pagamento de ${mesReferenciaLabel(propina.mesReferencia)} do aluno ${propina.aluno.nome} (${propina.aluno.curso}, ${propina.aluno.anoCurricular}º Ano)`,
      entityType: "Propina",
      entityId: propina.id,
    });
  } else {
    const mesPosteriorPago = outrosMeses.find(
      (m) => m.mesReferencia > propina.mesReferencia && m.status === "PAGO",
    );
    if (mesPosteriorPago) {
      return {
        error: `Não pode desmarcar ${mesReferenciaLabel(propina.mesReferencia)} enquanto ${mesReferenciaLabel(mesPosteriorPago.mesReferencia)} estiver pago.`,
      };
    }

    await prisma.propina.update({
      where: { id: propina.id },
      data: {
        status: "PENDENTE",
        valorPago: 0,
        dataPagamento: null,
        registadoPorId: null,
      },
    });

    await registrarAuditoria({
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? "Utilizador",
      userRole: session.user.role,
      action: `Reverteu o pagamento de ${mesReferenciaLabel(propina.mesReferencia)} do aluno ${propina.aluno.nome} (${propina.aluno.curso}, ${propina.aluno.anoCurricular}º Ano)`,
      entityType: "Propina",
      entityId: propina.id,
    });
  }

  revalidarFinanceiro(propina.alunoId);
  return {};
}

const ConfiguracaoFinanceiraSchema = z.object({
  bloqueioAtivo: z.boolean(),
  toleranciaDias: z.coerce.number().int().min(0).max(90),
  valorMensalPadrao: z.coerce.number().min(0),
});

export async function atualizarConfiguracaoFinanceiraAction(formData: FormData) {
  const session = await requireAdmin();
  const parsed = ConfiguracaoFinanceiraSchema.parse({
    bloqueioAtivo: formData.get("bloqueioAtivo") === "on",
    toleranciaDias: formData.get("toleranciaDias"),
    valorMensalPadrao: formData.get("valorMensalPadrao"),
  });

  await prisma.configuracaoFinanceira.upsert({
    where: { id: "config" },
    update: { ...parsed, updatedPorId: session.user.id },
    create: { id: "config", ...parsed, updatedPorId: session.user.id },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Atualizou a configuração financeira (bloqueio ${parsed.bloqueioAtivo ? "ativo" : "inativo"}, tolerância ${parsed.toleranciaDias} dia(s))`,
    entityType: "ConfiguracaoFinanceira",
    entityId: "config",
  });

  revalidatePath("/admin/financeiro/configuracao");
}

export interface AlunoResultadoPesquisa {
  id: string;
  nome: string;
  numeroEstudante: string;
  curso: string;
  anoCurricular: number;
  email: string;
}

export interface FiltrosPesquisaAluno {
  query: string;
  curso?: string;
  anoCurricular?: number;
  periodo?: "MATUTINO" | "VESPERTINO" | "NOTURNO";
}

export async function searchAlunosAction(filtros: FiltrosPesquisaAluno): Promise<AlunoResultadoPesquisa[]> {
  await requireFinanceiro();
  const termo = filtros.query.trim();
  const temFiltro = Boolean(filtros.curso || filtros.anoCurricular || filtros.periodo);
  if (termo.length < 2 && !temFiltro) return [];

  return prisma.aluno.findMany({
    where: {
      ...(termo.length >= 2 ? { nome: { contains: termo, mode: "insensitive" } } : {}),
      ...(filtros.curso ? { curso: filtros.curso } : {}),
      ...(filtros.anoCurricular ? { anoCurricular: filtros.anoCurricular } : {}),
      ...(filtros.periodo ? { matriculas: { some: { status: "ATIVA", turma: { periodo: filtros.periodo } } } } : {}),
    },
    orderBy: { nome: "asc" },
    take: 8,
    select: { id: true, nome: true, numeroEstudante: true, curso: true, anoCurricular: true, email: true },
  });
}

export async function getEstadoFinanceiroAlunoAction(alunoId: string): Promise<EstadoFinanceiroAluno> {
  await requireFinanceiro();
  return getEstadoFinanceiroAluno(alunoId);
}
