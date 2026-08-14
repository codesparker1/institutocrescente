"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import { mesReferenciaLabel, getEstadoFinanceiroAluno, type EstadoFinanceiroAluno } from "@/lib/financeiro";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { requireRegistarPagamento, requireGerirContas } from "@/lib/permissions";

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
  const session = await requireRegistarPagamento();
  const { propinaId } = TogglePropinaSchema.parse({
    propinaId: formData.get("propinaId"),
  });

  const propina = await prisma.cobranca.findUnique({
    where: { id: propinaId },
    include: { aluno: true },
  });
  if (!propina || propina.tipo !== "PROPINA" || !propina.mesReferencia) {
    throw new Error("Registo de propina não encontrado.");
  }
  const mesReferencia = propina.mesReferencia;

  const outrosMeses = await prisma.cobranca.findMany({
    where: { alunoId: propina.alunoId, tipo: "PROPINA", id: { not: propina.id } },
    orderBy: { mesReferencia: "asc" },
  });

  if (propina.status === "PENDENTE") {
    const mesAnteriorPorPagar = outrosMeses.find(
      (m) => m.mesReferencia! < mesReferencia && m.status === "PENDENTE",
    );
    if (mesAnteriorPorPagar) {
      return { error: `Tem de confirmar primeiro o pagamento de ${mesReferenciaLabel(mesAnteriorPorPagar.mesReferencia!)}.` };
    }

    await prisma.cobranca.update({
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
      action: `Confirmou o pagamento de ${mesReferenciaLabel(mesReferencia)} do aluno ${propina.aluno.nome} (${propina.aluno.curso}, ${propina.aluno.anoCurricular}º Ano)`,
      entityType: "Cobranca",
      entityId: propina.id,
      valorAnterior: "Pendente",
      valorNovo: "Pago",
    });
  } else {
    const mesPosteriorPago = outrosMeses.find(
      (m) => m.mesReferencia! > mesReferencia && m.status === "PAGO",
    );
    if (mesPosteriorPago) {
      return {
        error: `Não pode desmarcar ${mesReferenciaLabel(mesReferencia)} enquanto ${mesReferenciaLabel(mesPosteriorPago.mesReferencia!)} estiver pago.`,
      };
    }

    await prisma.cobranca.update({
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
      action: `Reverteu o pagamento de ${mesReferenciaLabel(mesReferencia)} do aluno ${propina.aluno.nome} (${propina.aluno.curso}, ${propina.aluno.anoCurricular}º Ano)`,
      entityType: "Cobranca",
      entityId: propina.id,
      valorAnterior: "Pago",
      valorNovo: "Pendente",
    });
  }

  revalidarFinanceiro(propina.alunoId);
  return {};
}

const ToggleMultaSchema = z.object({
  multaId: z.string().min(1),
});

/** Alterna o pagamento de uma multa. Sem ordenação por mês — cada multa é independente das outras. */
export async function toggleMultaAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireRegistarPagamento();
  const { multaId } = ToggleMultaSchema.parse({ multaId: formData.get("multaId") });

  const multa = await prisma.cobranca.findUnique({ where: { id: multaId }, include: { aluno: true } });
  if (!multa || multa.tipo !== "MULTA") throw new Error("Registo de multa não encontrado.");

  const paga = multa.status === "PENDENTE";
  await prisma.cobranca.update({
    where: { id: multa.id },
    data: paga
      ? { status: "PAGO", valorPago: multa.valorDevido, dataPagamento: new Date(), registadoPorId: session.user.id }
      : { status: "PENDENTE", valorPago: 0, dataPagamento: null, registadoPorId: null },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `${paga ? "Confirmou" : "Reverteu"} o pagamento de uma multa do aluno ${multa.aluno.nome} (${multa.aluno.curso}, ${multa.aluno.anoCurricular}º Ano)`,
    entityType: "Cobranca",
    entityId: multa.id,
    valorAnterior: paga ? "Pendente" : "Pago",
    valorNovo: paga ? "Pago" : "Pendente",
  });

  revalidarFinanceiro(multa.alunoId);
  return {};
}

const RegistarPagamentoEmolumentoSchema = z.object({
  alunoId: z.string().min(1),
  emolumentoId: z.string().min(1),
});

/**
 * Regista o pagamento de um emolumento — o pedido e o pagamento são presenciais na secretaria
 * (não há fluxo de solicitação pelo aluno), por isso a Cobranca já nasce paga.
 */
export async function registarPagamentoEmolumentoAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireRegistarPagamento();
  const { alunoId, emolumentoId } = RegistarPagamentoEmolumentoSchema.parse({
    alunoId: formData.get("alunoId"),
    emolumentoId: formData.get("emolumentoId"),
  });

  const [aluno, emolumento] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: alunoId } }),
    prisma.emolumento.findUnique({ where: { id: emolumentoId } }),
  ]);
  if (!aluno) return { error: "Aluno não encontrado." };
  if (!emolumento) return { error: "Emolumento não encontrado." };

  const agora = new Date();
  const cobranca = await prisma.cobranca.create({
    data: {
      alunoId,
      tipo: "EMOLUMENTO",
      descricao: emolumento.nome,
      valorDevido: emolumento.valor,
      valorPago: emolumento.valor,
      status: "PAGO",
      dataVencimento: agora,
      dataPagamento: agora,
      registadoPorId: session.user.id,
    },
  });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Registou o pagamento do emolumento "${emolumento.nome}" do aluno ${aluno.nome}`,
    entityType: "Cobranca",
    entityId: cobranca.id,
  });

  revalidarFinanceiro(alunoId);
  return {};
}

const RemoverPagamentoEmolumentoSchema = z.object({
  cobrancaId: z.string().min(1),
});

/** Corrige um registo enganado — remove a linha por completo (não há estado "pendente" para reverter). */
export async function removerPagamentoEmolumentoAction(formData: FormData): Promise<void> {
  const session = await requireRegistarPagamento();
  const { cobrancaId } = RemoverPagamentoEmolumentoSchema.parse({ cobrancaId: formData.get("cobrancaId") });

  const cobranca = await prisma.cobranca.findUnique({ where: { id: cobrancaId }, include: { aluno: true } });
  if (!cobranca || cobranca.tipo !== "EMOLUMENTO") throw new Error("Registo não encontrado.");

  await prisma.cobranca.delete({ where: { id: cobranca.id } });

  await registrarAuditoria({
    userId: session.user.id,
    userName: session.user.name ?? session.user.email ?? "Utilizador",
    userRole: session.user.role,
    action: `Removeu o registo do emolumento "${cobranca.descricao ?? ""}" do aluno ${cobranca.aluno.nome} (enganado)`,
    entityType: "Cobranca",
    entityId: cobranca.id,
  });

  revalidarFinanceiro(cobranca.alunoId);
}

const ConfiguracaoFinanceiraSchema = z.object({
  bloqueioAtivo: z.boolean(),
  toleranciaDias: z.coerce
    .number("Indique os dias de tolerância")
    .int()
    .min(0, "Mínimo 0 dias")
    .max(90, "Máximo 90 dias"),
  diaVencimento: z.coerce
    .number("Indique o dia de vencimento")
    .int()
    .min(1, "Mínimo dia 1")
    .max(28, "Máximo dia 28 (para existir em todos os meses)"),
  valorMulta: z.coerce.number("Indique o valor da multa").min(0, "O valor não pode ser negativo"),
});

const CAMPOS_CONFIG = ["toleranciaDias", "diaVencimento", "valorMulta"] as const;
export type ConfiguracaoFinanceiraState = FormState<Record<(typeof CAMPOS_CONFIG)[number], string>> & {
  success?: boolean;
};

export async function atualizarConfiguracaoFinanceiraAction(
  _prevState: ConfiguracaoFinanceiraState,
  formData: FormData,
): Promise<ConfiguracaoFinanceiraState> {
  const session = await requireGerirContas();
  const parsed = ConfiguracaoFinanceiraSchema.safeParse({
    bloqueioAtivo: formData.get("bloqueioAtivo") === "on",
    toleranciaDias: formData.get("toleranciaDias"),
    diaVencimento: formData.get("diaVencimento"),
    valorMulta: formData.get("valorMulta"),
  });
  if (!parsed.success) return erroDeValidacao(parsed.error, formData, CAMPOS_CONFIG);

  try {
    await prisma.configuracaoFinanceira.upsert({
      where: { id: "config" },
      update: { ...parsed.data, updatedPorId: session.user.id },
      create: { id: "config", ...parsed.data, updatedPorId: session.user.id },
    });

    await registrarAuditoria({
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? "Utilizador",
      userRole: session.user.role,
      action: `Atualizou a configuração financeira (bloqueio ${parsed.data.bloqueioAtivo ? "ativo" : "inativo"}, tolerância ${parsed.data.toleranciaDias} dia(s))`,
      entityType: "ConfiguracaoFinanceira",
      entityId: "config",
    });
  } catch {
    return {
      error: "Não foi possível guardar a configuração.",
      values: extrairValores(formData, CAMPOS_CONFIG),
    };
  }

  revalidatePath("/admin/financeiro/configuracao");
  return { success: true };
}

export interface AlunoResultadoPesquisa {
  id: string;
  nome: string;
  numeroEstudante: string;
  curso: string;
  anoCurricular: number;
  email: string | null;
}

export interface FiltrosPesquisaAluno {
  query: string;
  curso?: string;
  anoCurricular?: number;
  periodo?: "MATUTINO" | "VESPERTINO" | "NOTURNO";
}

export async function searchAlunosAction(filtros: FiltrosPesquisaAluno): Promise<AlunoResultadoPesquisa[]> {
  await requireRegistarPagamento();
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
  await requireRegistarPagamento();
  return getEstadoFinanceiroAluno(alunoId);
}
