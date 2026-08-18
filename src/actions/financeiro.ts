"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { registrarAuditoria } from "@/lib/audit";
import {
  mesReferenciaLabel,
  getEstadoFinanceiroAluno,
  getCatalogoEmolumentos,
  getEmolumentosPagos,
  type EstadoFinanceiroAluno,
  type EmolumentoCatalogo,
  type EmolumentoPago,
} from "@/lib/financeiro";
import { chaveMes } from "@/lib/utils";
import { erroDeValidacao, extrairValores, type FormState } from "@/lib/forms";
import { requireRegistarPagamento, requireGerirContas, requireAlterarPagamentoIndividual } from "@/lib/permissions";
import { getAgora } from "@/lib/tempo";

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

/**
 * Toggle individual de uma propina (fora do lote de Registo de Pagamentos) — só ADMIN
 * (§pedido do cliente 2026-08-18): é o único caminho que ainda invoca esta ação (Situação
 * Financeira em /alunos/[id], editável só para ADMIN); a Secretaria confirma/reverte sempre
 * pelo lote em confirmarPagamentosEmLoteAction.
 */
export async function togglePropinaAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireAlterarPagamentoIndividual();
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

    // A multa por atraso do mesmo mês não é uma escolha à parte — pagar a mensalidade paga-a sempre junto.
    const multaPendente = await prisma.cobranca.findFirst({
      where: { alunoId: propina.alunoId, tipo: "MULTA", mesReferencia, status: "PENDENTE" },
    });

    const agora = getAgora();
    await prisma.$transaction([
      prisma.cobranca.update({
        where: { id: propina.id },
        data: { status: "PAGO", valorPago: propina.valorDevido, dataPagamento: agora, registadoPorId: session.user.id },
      }),
      ...(multaPendente
        ? [
            prisma.cobranca.update({
              where: { id: multaPendente.id },
              data: { status: "PAGO", valorPago: multaPendente.valorDevido, dataPagamento: agora, registadoPorId: session.user.id },
            }),
          ]
        : []),
    ]);

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
    if (multaPendente) {
      await registrarAuditoria({
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? "Utilizador",
        userRole: session.user.role,
        action: `Confirmou junto o pagamento da multa por atraso de ${mesReferenciaLabel(mesReferencia)} do aluno ${propina.aluno.nome} (${propina.aluno.curso}, ${propina.aluno.anoCurricular}º Ano)`,
        entityType: "Cobranca",
        entityId: multaPendente.id,
        valorAnterior: "Pendente",
        valorNovo: "Pago",
      });
    }
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

/**
 * Alterna o pagamento de uma multa sozinha (sem ordenação por mês — cada multa é independente das
 * outras). Só ADMIN (§pedido do cliente 2026-08-18): a Secretaria vê que a multa está pendente,
 * mas só a consegue pagar junto de uma mensalidade em confirmarPagamentosEmLoteAction, nunca isolada.
 */
export async function toggleMultaAction(formData: FormData): Promise<{ error?: string }> {
  const session = await requireAlterarPagamentoIndividual();
  const { multaId } = ToggleMultaSchema.parse({ multaId: formData.get("multaId") });

  const multa = await prisma.cobranca.findUnique({ where: { id: multaId }, include: { aluno: true } });
  if (!multa || multa.tipo !== "MULTA") throw new Error("Registo de multa não encontrado.");

  const paga = multa.status === "PENDENTE";
  await prisma.cobranca.update({
    where: { id: multa.id },
    data: paga
      ? { status: "PAGO", valorPago: multa.valorDevido, dataPagamento: getAgora(), registadoPorId: session.user.id }
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

const ConfirmarPagamentosEmLoteSchema = z.object({
  alunoId: z.string().min(1),
  cobrancaIds: z.array(z.string().min(1)).min(1, "Selecione pelo menos um item."),
  semMulta: z.coerce.boolean().default(false),
});

/**
 * Confirma várias PROPINA/MULTA pendentes de uma vez (para emitir um único recibo em papel).
 * Generaliza a regra de ordem de togglePropinaAction: entre as PROPINA selecionadas, todas as
 * PROPINA pendentes do aluno com mês <= ao mês mais recente selecionado têm de entrar no lote —
 * senão a secretaria conseguiria "saltar" um mês em atraso escondido no meio de um lote grande.
 * MULTA não tem ordem (mesma regra de toggleMultaAction).
 *
 * `semMulta` (§pedido do cliente 2026-08-18): só o ADMIN pode pagar a mensalidade sem forçar
 * junto a multa do mesmo mês — a Secretaria e o DAAC continuam sempre com o comportamento
 * anterior (junta sempre). Nunca confiar só no valor vindo do browser: mesmo que alguém force
 * `semMulta=true` no pedido, só tem efeito se a sessão for mesmo ADMIN.
 */
export async function confirmarPagamentosEmLoteAction(
  formData: FormData,
): Promise<{ error?: string; cobrancaIds?: string[] }> {
  const session = await requireRegistarPagamento();
  const parsed = ConfirmarPagamentosEmLoteSchema.safeParse({
    alunoId: formData.get("alunoId"),
    cobrancaIds: formData.getAll("cobrancaIds"),
    semMulta: formData.get("semMulta"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Seleção inválida." };
  const { alunoId, cobrancaIds } = parsed.data;
  const semMulta = parsed.data.semMulta && session.user.role === "ADMIN";

  const [aluno, selecionadas, todasPropinasPendentes] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: alunoId } }),
    prisma.cobranca.findMany({ where: { id: { in: cobrancaIds }, alunoId } }),
    prisma.cobranca.findMany({ where: { alunoId, tipo: "PROPINA", status: "PENDENTE" } }),
  ]);
  if (!aluno) return { error: "Aluno não encontrado." };
  if (selecionadas.length !== cobrancaIds.length) return { error: "Um ou mais itens selecionados não foram encontrados." };
  if (selecionadas.some((c) => c.status !== "PENDENTE" || !["PROPINA", "MULTA"].includes(c.tipo))) {
    return { error: "Um ou mais itens selecionados já não estão pendentes." };
  }

  const propinasSelecionadas = selecionadas.filter((c) => c.tipo === "PROPINA");
  if (propinasSelecionadas.length > 0) {
    const idsSelecionados = new Set(propinasSelecionadas.map((c) => c.id));
    const mesMaisRecente = propinasSelecionadas.reduce(
      (max, c) => (c.mesReferencia! > max ? c.mesReferencia! : max),
      propinasSelecionadas[0].mesReferencia!,
    );
    const exigidas = todasPropinasPendentes.filter((c) => c.mesReferencia! <= mesMaisRecente);
    const faltaAlguma = exigidas.some((c) => !idsSelecionados.has(c.id));
    if (faltaAlguma) {
      return { error: "Tem de incluir no lote todos os meses pendentes anteriores ao mês mais recente selecionado." };
    }
  }

  // A multa por atraso do mesmo mês normalmente não é opcional — junta-se sempre a quem paga a
  // mensalidade, mesmo que o cliente não a tenha (ainda) enviado. Exceção: `semMulta`, só honrada
  // para ADMIN (ver validação de `semMulta` acima) — divide deliberadamente a mensalidade da multa.
  const multasPendentesDoAluno =
    propinasSelecionadas.length > 0 && !semMulta
      ? await prisma.cobranca.findMany({ where: { alunoId, tipo: "MULTA", status: "PENDENTE" } })
      : [];
  const multaPorChaveMes = new Map(
    multasPendentesDoAluno.filter((m) => m.mesReferencia).map((m) => [chaveMes(m.mesReferencia!), m]),
  );
  const idsJaSelecionados = new Set(selecionadas.map((c) => c.id));
  const multasAIncluir = propinasSelecionadas
    .map((c) => multaPorChaveMes.get(chaveMes(c.mesReferencia!)))
    .filter((m): m is NonNullable<typeof m> => m !== undefined && !idsJaSelecionados.has(m.id));

  const todasParaConfirmar = [...selecionadas, ...multasAIncluir];

  const agora = getAgora();
  await prisma.$transaction(
    todasParaConfirmar.map((c) =>
      prisma.cobranca.update({
        where: { id: c.id },
        data: { status: "PAGO", valorPago: c.valorDevido, dataPagamento: agora, registadoPorId: session.user.id },
      }),
    ),
  );

  await Promise.all(
    todasParaConfirmar.map((c) =>
      registrarAuditoria({
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? "Utilizador",
        userRole: session.user.role,
        action:
          c.tipo === "PROPINA"
            ? `Confirmou em lote o pagamento de ${mesReferenciaLabel(c.mesReferencia!)} do aluno ${aluno.nome} (${aluno.curso}, ${aluno.anoCurricular}º Ano)`
            : `Confirmou em lote o pagamento de uma multa do aluno ${aluno.nome} (${aluno.curso}, ${aluno.anoCurricular}º Ano)`,
        entityType: "Cobranca",
        entityId: c.id,
        valorAnterior: "Pendente",
        valorNovo: "Pago",
      }),
    ),
  );

  revalidarFinanceiro(alunoId);
  return { cobrancaIds: todasParaConfirmar.map((c) => c.id) };
}

const RegistarEmolumentosEmLoteSchema = z.object({
  alunoId: z.string().min(1),
  emolumentoIds: z.array(z.string().min(1)).min(1, "Selecione pelo menos um emolumento."),
});

/** Regista o pagamento de vários emolumentos de uma vez (para emitir um único recibo em papel). */
export async function registarEmolumentosEmLoteAction(
  formData: FormData,
): Promise<{ error?: string; cobrancaIds?: string[] }> {
  const session = await requireRegistarPagamento();
  const parsed = RegistarEmolumentosEmLoteSchema.safeParse({
    alunoId: formData.get("alunoId"),
    emolumentoIds: formData.getAll("emolumentoIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Seleção inválida." };
  const { alunoId, emolumentoIds } = parsed.data;

  const [aluno, emolumentos] = await Promise.all([
    prisma.aluno.findUnique({ where: { id: alunoId } }),
    prisma.emolumento.findMany({ where: { id: { in: emolumentoIds } } }),
  ]);
  if (!aluno) return { error: "Aluno não encontrado." };
  if (emolumentos.length !== emolumentoIds.length) return { error: "Um ou mais emolumentos selecionados não foram encontrados." };

  const agora = getAgora();
  const cobrancas = await prisma.$transaction(
    emolumentos.map((emolumento) =>
      prisma.cobranca.create({
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
      }),
    ),
  );

  await Promise.all(
    cobrancas.map((cobranca, index) =>
      registrarAuditoria({
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? "Utilizador",
        userRole: session.user.role,
        action: `Registou em lote o pagamento do emolumento "${emolumentos[index].nome}" do aluno ${aluno.nome}`,
        entityType: "Cobranca",
        entityId: cobranca.id,
      }),
    ),
  );

  revalidarFinanceiro(alunoId);
  return { cobrancaIds: cobrancas.map((c) => c.id) };
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

export async function getCatalogoEmolumentosAction(): Promise<EmolumentoCatalogo[]> {
  await requireRegistarPagamento();
  return getCatalogoEmolumentos();
}

export async function getEmolumentosPagosAction(alunoId: string): Promise<EmolumentoPago[]> {
  await requireRegistarPagamento();
  return getEmolumentosPagos(alunoId);
}
